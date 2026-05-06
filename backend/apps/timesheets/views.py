from datetime import date as date_cls
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models import Q, Sum
from django.utils import timezone as djtz
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.tenant import TenantScopedMixin
from apps.projects.models import ProjectMembership

from .models import Submission, TimeEntry
from .serializers import (
    SubmissionCreateSerializer,
    SubmissionDecisionSerializer,
    SubmissionSerializer,
    TimeEntrySerializer,
)

User = get_user_model()


def _notify_approvers_of_submission(submission: Submission) -> None:
    """Email owners + admins + project-managers of the relevant projects."""
    project_ids = list(
        TimeEntry.objects.filter(
            user_id=submission.user_id,
            date__gte=submission.start_date,
            date__lte=submission.end_date,
        ).values_list('project_id', flat=True).distinct()
    )
    manager_ids = set(
        ProjectMembership.objects.filter(
            project_id__in=project_ids, is_project_manager=True,
        ).values_list('user_id', flat=True)
    )

    recipients = (
        User.objects.filter(
            account_id=submission.account_id, is_active=True,
        )
        .filter(Q(role__in=['owner', 'admin']) | Q(id__in=manager_ids))
        .exclude(id=submission.user_id)
        .distinct()
    )
    emails = list(recipients.values_list('email', flat=True))
    if not emails:
        return

    submitter_name = submission.user.full_name or submission.user.email
    if submission.start_date == submission.end_date:
        range_str = submission.start_date.strftime('%b %d, %Y')
    else:
        range_str = (
            f"{submission.start_date.strftime('%b %d')} – "
            f"{submission.end_date.strftime('%b %d, %Y')}"
        )

    total_hours = (
        TimeEntry.objects.filter(
            user_id=submission.user_id,
            date__gte=submission.start_date,
            date__lte=submission.end_date,
        ).aggregate(t=Sum('hours'))['t']
        or Decimal('0')
    )
    billable_hours = (
        TimeEntry.objects.filter(
            user_id=submission.user_id,
            date__gte=submission.start_date,
            date__lte=submission.end_date,
            is_billable=True,
        ).aggregate(t=Sum('hours'))['t']
        or Decimal('0')
    )

    approval_url = f"{settings.FRONTEND_URL.rstrip('/')}/time"

    subject = f'[TrackFlow] {submitter_name} submitted a timesheet for {range_str}'
    body = (
        f"Hi,\n\n"
        f"{submitter_name} just submitted their timesheet.\n\n"
        f"  Period:           {range_str}\n"
        f"  Total hours:      {total_hours:.2f}\n"
        f"  Billable hours:   {billable_hours:.2f}\n\n"
        f"Review and approve here:\n{approval_url}\n\n"
        f"— TrackFlow"
    )

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=emails,
        fail_silently=not settings.DEBUG,
    )


def _active_submission_for(user_id: int, when: date_cls):
    """Return the submission (submitted/approved) covering this date for this user, or None."""
    return Submission.objects.filter(
        user_id=user_id,
        start_date__lte=when,
        end_date__gte=when,
        status__in=[Submission.Status.SUBMITTED, Submission.Status.APPROVED],
    ).first()


def _managed_project_ids(user):
    return ProjectMembership.objects.filter(
        user_id=user.id, is_project_manager=True,
    ).values_list('project_id', flat=True)


def _can_modify_entry(user, entry: TimeEntry) -> bool:
    """Return True if `user` may edit/delete this entry."""
    if user.role in ('owner', 'admin'):
        return True
    if entry.user_id == user.id:
        return True
    if user.role == 'manager':
        return ProjectMembership.objects.filter(
            project_id=entry.project_id,
            user_id=user.id,
            is_project_manager=True,
        ).exists()
    return False


def _is_locked_for(user, target_user_id: int, when: date_cls) -> bool:
    """A date is locked for `user` if `target_user_id` has an active submission covering
    `when`, AND `user` is the member themselves (managers/admins/owners can override)."""
    if user.role in ('owner', 'admin', 'manager'):
        return False
    sub = _active_submission_for(target_user_id, when)
    return sub is not None


def _stop_running_entry(entry: TimeEntry) -> TimeEntry:
    """Commit elapsed time on a running entry and flip it off."""
    if entry.started_at:
        elapsed_seconds = (djtz.now() - entry.started_at).total_seconds()
        additional_hours = Decimal(str(round(elapsed_seconds / 3600, 4)))
        current = entry.hours or Decimal('0')
        new_total = current + additional_hours
        # Cap at 24 hours to satisfy model.clean() — protects against runaway timers.
        if new_total > Decimal('24'):
            new_total = Decimal('24')
        entry.hours = new_total
    entry.is_running = False
    entry.started_at = None
    entry.save(update_fields=['hours', 'is_running', 'started_at', 'updated_at'])
    return entry


class TimeEntryViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """CRUD for time entries.

    Scope rules (V1 — manager scope tightens in US-12):
    - Owner / Admin: all entries in the workspace
    - Manager / Member: own entries only
    """

    queryset = TimeEntry.objects.select_related(
        'user', 'project__client', 'project_task__task',
    )
    serializer_class = TimeEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if user.role == 'manager':
            qs = qs.filter(Q(user_id=user.id) | Q(project_id__in=_managed_project_ids(user)))
        elif user.role not in ('owner', 'admin'):
            qs = qs.filter(user_id=user.id)

        params = self.request.query_params
        date_param = params.get('date')
        if date_param:
            qs = qs.filter(date=date_param)

        start_date = params.get('start_date')
        end_date = params.get('end_date')
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)

        project_id = params.get('project_id')
        if project_id:
            qs = qs.filter(project_id=project_id)

        # owner/admin/manager may filter by user_id; manager scope already constrains qs.
        user_id = params.get('user_id')
        if user_id and user.role in ('owner', 'admin', 'manager'):
            qs = qs.filter(user_id=user_id)

        # ---- Detailed Time report filters ----
        client_id = params.get('client_id')
        if client_id:
            qs = qs.filter(project__client_id=client_id)

        task_id = params.get('task_id')
        if task_id:
            qs = qs.filter(project_task__task_id=task_id)

        is_billable = params.get('is_billable')
        if is_billable is not None:
            normalized = str(is_billable).lower()
            if normalized in ('true', '1', 'yes'):
                qs = qs.filter(is_billable=True)
            elif normalized in ('false', '0', 'no'):
                qs = qs.filter(is_billable=False)

        active_only = params.get('active_only')
        if active_only is not None and str(active_only).lower() in ('true', '1', 'yes'):
            qs = qs.filter(project__is_active=True)

        search = params.get('search')
        if search:
            qs = qs.filter(
                Q(notes__icontains=search)
                | Q(project__name__icontains=search)
                | Q(project__client__name__icontains=search)
                | Q(project_task__task__name__icontains=search)
                | Q(user__full_name__icontains=search)
                | Q(jira_issue_key__icontains=search)
            )

        return qs

    def create(self, request, *args, **kwargs):
        # If the member's week is submitted/approved, block new entries on that date.
        date_str = request.data.get('date')
        if date_str:
            try:
                when = date_cls.fromisoformat(str(date_str))
            except ValueError:
                when = None
            if when and _is_locked_for(request.user, request.user.id, when):
                return Response(
                    {'detail': 'This week is submitted for approval and locked.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if not _can_modify_entry(request.user, instance):
            return Response(
                {'detail': 'You do not have permission to edit this entry.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if _is_locked_for(request.user, instance.user_id, instance.date):
            return Response(
                {'detail': 'This week is submitted for approval and locked.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if not _can_modify_entry(request.user, instance):
            return Response(
                {'detail': 'You do not have permission to delete this entry.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if _is_locked_for(request.user, instance.user_id, instance.date):
            return Response(
                {'detail': 'This week is submitted for approval and locked.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='running')
    def running(self, request):
        """Return the user's currently running entry, or null."""
        entry = TimeEntry.objects.filter(
            user_id=request.user.id, is_running=True,
        ).select_related('project__client', 'project_task__task', 'user').first()
        if entry is None:
            return Response(None)
        return Response(TimeEntrySerializer(entry, context={'request': request}).data)

    @action(detail=False, methods=['post'], url_path='start')
    def start(self, request):
        """Start a new timer. Auto-stops any currently running timer for this user."""
        # Block start if the user's target date is locked.
        date_str = request.data.get('date')
        if date_str:
            try:
                when = date_cls.fromisoformat(str(date_str))
            except ValueError:
                when = None
            if when and _is_locked_for(request.user, request.user.id, when):
                return Response(
                    {'detail': 'This week is submitted for approval and locked.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Stop any in-flight timers first — only one running entry per user.
        for existing in TimeEntry.objects.filter(
            user_id=request.user.id, is_running=True,
        ):
            _stop_running_entry(existing)

        serializer = TimeEntrySerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        entry = serializer.save(
            is_running=True,
            started_at=djtz.now(),
            hours=Decimal('0.00'),
        )
        return Response(
            TimeEntrySerializer(entry, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='resume')
    def resume(self, request, pk=None):
        """Resume an existing entry as a running timer (Harvest behavior).

        Unlike `start`, this does NOT create a new TimeEntry — it flips the
        existing one to is_running=True so subsequent stop adds elapsed time
        to the same row's hours. Any other running timer is stopped first.
        """
        entry = self.get_object()
        if entry.user_id != request.user.id and request.user.role not in ('owner', 'admin'):
            return Response(
                {'detail': 'You can only resume your own entries.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if _is_locked_for(request.user, entry.user_id, entry.date):
            return Response(
                {'detail': 'This week is submitted for approval and locked.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if entry.is_running:
            return Response(
                TimeEntrySerializer(entry, context={'request': request}).data,
            )
        # Stop any other in-flight timer for this user first.
        for existing in TimeEntry.objects.filter(
            user_id=request.user.id, is_running=True,
        ).exclude(pk=entry.pk):
            _stop_running_entry(existing)

        entry.is_running = True
        entry.started_at = djtz.now()
        entry.save(update_fields=['is_running', 'started_at', 'updated_at'])
        return Response(
            TimeEntrySerializer(entry, context={'request': request}).data,
        )

    @action(detail=True, methods=['post'], url_path='stop')
    def stop(self, request, pk=None):
        """Stop a running timer and commit elapsed hours."""
        entry = self.get_object()
        if entry.user_id != request.user.id and request.user.role not in ('owner', 'admin'):
            return Response(
                {'detail': 'You can only stop your own timer.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not entry.is_running:
            return Response(
                {'detail': 'This entry is not running.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if _is_locked_for(request.user, entry.user_id, entry.date):
            return Response(
                {'detail': 'This week is submitted for approval and locked.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        _stop_running_entry(entry)
        return Response(TimeEntrySerializer(entry, context={'request': request}).data)


class SubmissionViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """Timesheet submissions — submit / approve / reject / withdraw.

    Scope:
    - Member: own submissions only
    - Manager / Admin / Owner: all submissions in their workspace
    """

    queryset = Submission.objects.select_related('user', 'decided_by')
    serializer_class = SubmissionSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']  # no PATCH/DELETE — use actions

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if user.role not in ('owner', 'admin', 'manager'):
            qs = qs.filter(user_id=user.id)

        params = self.request.query_params
        user_id = params.get('user_id')
        if user_id:
            qs = qs.filter(user_id=user_id)

        status_param = params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        start_date = params.get('start_date')
        end_date = params.get('end_date')
        if start_date:
            qs = qs.filter(end_date__gte=start_date)
        if end_date:
            qs = qs.filter(start_date__lte=end_date)

        return qs

    def create(self, request, *args, **kwargs):
        serializer = SubmissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Block if there's already an active submission overlapping this range.
        overlapping = Submission.objects.filter(
            user_id=request.user.id,
            account_id=request.user.account_id,
            status__in=[Submission.Status.SUBMITTED, Submission.Status.APPROVED],
            start_date__lte=data['end_date'],
            end_date__gte=data['start_date'],
        ).first()
        if overlapping:
            return Response(
                {
                    'detail': (
                        'You already have a submission covering part of this range '
                        f'({overlapping.start_date} – {overlapping.end_date}, '
                        f'{overlapping.get_status_display()}). '
                        'Withdraw it before submitting again.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reject empty weeks — must have at least one entry in range.
        has_entries = TimeEntry.objects.filter(
            user_id=request.user.id,
            date__gte=data['start_date'],
            date__lte=data['end_date'],
        ).exists()
        if not has_entries:
            return Response(
                {'detail': 'No time entries in this range to submit.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        submission = Submission.objects.create(
            account_id=request.user.account_id,
            user=request.user,
            start_date=data['start_date'],
            end_date=data['end_date'],
            status=Submission.Status.SUBMITTED,
        )

        # Email approvers — best-effort; never block the response on email failure.
        try:
            _notify_approvers_of_submission(submission)
        except Exception:
            pass

        return Response(
            SubmissionSerializer(submission, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='withdraw')
    def withdraw(self, request, pk=None):
        submission = self.get_object()
        if submission.user_id != request.user.id:
            return Response(
                {'detail': 'You can only withdraw your own submission.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if submission.status != Submission.Status.SUBMITTED:
            return Response(
                {'detail': f'Cannot withdraw a {submission.get_status_display().lower()} submission.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        submission.delete()
        return Response({'detail': 'Submission withdrawn.'})

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        if request.user.role not in ('owner', 'admin', 'manager'):
            return Response(
                {'detail': 'Only managers and admins can approve.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        submission = self.get_object()
        # Managers cannot approve their own week; owners / admins can self-approve.
        if (
            submission.user_id == request.user.id
            and request.user.role == 'manager'
        ):
            return Response(
                {'detail': 'Managers cannot approve their own timesheet. Ask another approver to review.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if submission.status != Submission.Status.SUBMITTED:
            return Response(
                {'detail': f'Cannot approve a {submission.get_status_display().lower()} submission.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        decision = SubmissionDecisionSerializer(data=request.data)
        decision.is_valid(raise_exception=True)
        submission.status = Submission.Status.APPROVED
        submission.decided_at = djtz.now()
        submission.decided_by = request.user
        submission.decision_note = decision.validated_data.get('decision_note', '') or ''
        submission.save(update_fields=[
            'status', 'decided_at', 'decided_by', 'decision_note', 'updated_at',
        ])
        return Response(
            SubmissionSerializer(submission, context={'request': request}).data,
        )

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        if request.user.role not in ('owner', 'admin', 'manager'):
            return Response(
                {'detail': 'Only managers and admins can reject.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        submission = self.get_object()
        if (
            submission.user_id == request.user.id
            and request.user.role == 'manager'
        ):
            return Response(
                {'detail': 'Managers cannot decide on their own timesheet. Ask another approver.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if submission.status != Submission.Status.SUBMITTED:
            return Response(
                {'detail': f'Cannot reject a {submission.get_status_display().lower()} submission.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        decision = SubmissionDecisionSerializer(data=request.data)
        decision.is_valid(raise_exception=True)
        submission.status = Submission.Status.REJECTED
        submission.decided_at = djtz.now()
        submission.decided_by = request.user
        submission.decision_note = decision.validated_data.get('decision_note', '') or ''
        submission.save(update_fields=[
            'status', 'decided_at', 'decided_by', 'decision_note', 'updated_at',
        ])
        return Response(
            SubmissionSerializer(submission, context={'request': request}).data,
        )
