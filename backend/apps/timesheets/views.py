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
from rest_framework.views import APIView

from apps.accounts.models import merged_notification_prefs
from apps.accounts.module_permissions import module_required
from apps.accounts.tenant import TenantScopedMixin
from apps.projects.models import ProjectMembership

from .models import ImportBatch, Submission, TimeEntry
from .serializers import (
    ImportBatchSerializer,
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

    emails = []
    for user in recipients:
        prefs = merged_notification_prefs(user)
        is_people_approver = user.role in ('owner', 'admin')
        is_project_approver = user.id in manager_ids
        if (
            (is_people_approver and prefs.get('approval_email_people'))
            or (is_project_approver and prefs.get('approval_email_projects'))
        ):
            emails.append(user.email)
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


def _notify_submitter_of_approval(submission: Submission) -> None:
    """Email the submitter when their timesheet is approved (gated by pref)."""
    submitter = submission.user
    if not submitter or not submitter.is_active or not submitter.email:
        return
    prefs = merged_notification_prefs(submitter)
    if not prefs.get('approval_email_approved'):
        return

    if submission.start_date == submission.end_date:
        range_str = submission.start_date.strftime('%b %d, %Y')
    else:
        range_str = (
            f"{submission.start_date.strftime('%b %d')} – "
            f"{submission.end_date.strftime('%b %d, %Y')}"
        )

    approver = submission.decided_by
    approver_name = (approver.full_name or approver.email) if approver else 'Your manager'

    time_url = f"{settings.FRONTEND_URL.rstrip('/')}/time"
    subject = f'[TrackFlow] Your timesheet for {range_str} was approved'
    body = (
        f"Hi {submitter.full_name or 'there'},\n\n"
        f"{approver_name} approved your timesheet for {range_str}.\n\n"
        f"View it here:\n{time_url}\n\n"
        f"— TrackFlow"
    )
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[submitter.email],
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
        kwargs['partial'] = True
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
    permission_classes = [IsAuthenticated, module_required('timesheet_approval')]
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

        # Email submitter — best-effort; never block the response on email failure.
        try:
            _notify_submitter_of_approval(submission)
        except Exception:
            pass

        return Response(
            SubmissionSerializer(submission, context={'request': request}).data,
        )

    @action(detail=True, methods=['post'], url_path='unapprove')
    def unapprove(self, request, pk=None):
        """Revert an approved submission back to SUBMITTED so it can be re-decided.

        Manager/admin/owner only. Status APPROVED is the only valid source state.
        """
        if request.user.role not in ('owner', 'admin', 'manager'):
            return Response(
                {'detail': 'Only managers and admins can withdraw approval.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        submission = self.get_object()
        if submission.status != Submission.Status.APPROVED:
            return Response(
                {'detail': f'Cannot withdraw approval on a {submission.get_status_display().lower()} submission.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        submission.status = Submission.Status.SUBMITTED
        submission.decided_at = None
        submission.decided_by = None
        submission.decision_note = ''
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


# -------- Import / Revert (Settings → Import/Export) --------

import re as _re

# Strip leading bracketed tags like "[SAMPLE]", "[ARCHIVED]", "(internal)" from a name
# so an import value of "Monthly Retainer" matches a DB row "[SAMPLE] Monthly Retainer".
_BRACKET_PREFIX_RE = _re.compile(r'^\s*[\[\(][^\]\)]+[\]\)]\s*')


def _strip_prefix(name: str) -> str:
    s = (name or '').strip().lower()
    while True:
        new_s = _BRACKET_PREFIX_RE.sub('', s)
        if new_s == s:
            return s
        s = new_s


def _name_lookup_maps(account_id: int):
    """Pre-build {lower(name): obj} maps for projects/tasks/users in this account.

    Two indexes per entity: exact-name (case-insensitive) and stripped-prefix
    (e.g. "[SAMPLE] Foo" → "foo"). Lookups try exact first, then stripped, so
    a CSV exported from another tracker without our [SAMPLE] tags still maps.
    """
    from apps.projects.models import Project, ProjectTask
    UserModel = get_user_model()

    projects: dict[str, object] = {}
    projects_alt: dict[str, object] = {}
    for p in Project.objects.filter(account_id=account_id):
        exact = p.name.strip().lower()
        projects[exact] = p
        stripped = _strip_prefix(p.name)
        if stripped and stripped != exact:
            projects_alt.setdefault(stripped, p)

    project_tasks: dict[tuple[int, str], object] = {}
    project_tasks_alt: dict[tuple[int, str], object] = {}
    for pt in ProjectTask.objects.filter(project__account_id=account_id).select_related('task'):
        task_name = pt.task.name.strip().lower()
        project_tasks[(pt.project_id, task_name)] = pt
        stripped = _strip_prefix(pt.task.name)
        if stripped and stripped != task_name:
            project_tasks_alt.setdefault((pt.project_id, stripped), pt)

    users_by_email = {
        u.email.strip().lower(): u
        for u in UserModel.objects.filter(account_id=account_id)
    }
    users_by_name = {
        (u.full_name or '').strip().lower(): u
        for u in UserModel.objects.filter(account_id=account_id) if u.full_name
    }
    return projects, projects_alt, project_tasks, project_tasks_alt, users_by_email, users_by_name


def _suggest_names(query: str, candidates: list[str], limit: int = 3) -> list[str]:
    """Cheap suggestion: substring match on either side, capped."""
    q = (query or '').strip().lower()
    if not q:
        return []
    hits = [c for c in candidates if q in c.lower() or c.lower() in q]
    return hits[:limit]


def _parse_import_date(value: str):
    """Accept YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY."""
    s = (value or '').strip()
    if not s:
        return None
    from datetime import datetime as _dt
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y'):
        try:
            return _dt.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


class ImportTimeEntriesView(APIView):
    """POST /api/v1/imports/time/

    Body: {
      rows: [{date, project, task, person?, hours, notes?, billable?, row_label?}, ...],
      source_filename?: str
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from decimal import InvalidOperation as _InvalidOp

        if request.user.role not in ('owner', 'admin'):
            return Response(
                {'detail': 'Only owners and admins can import time.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        rows = request.data.get('rows') or []
        source_filename = (request.data.get('source_filename') or '')[:255]

        if not isinstance(rows, list) or len(rows) == 0:
            return Response({'detail': 'No rows provided.'}, status=status.HTTP_400_BAD_REQUEST)

        account_id = request.user.account_id
        (
            projects, projects_alt,
            project_tasks, project_tasks_alt,
            users_by_email, users_by_name,
        ) = _name_lookup_maps(account_id)
        all_project_names = [p.name for p in projects.values()]

        batch = ImportBatch.objects.create(
            account_id=account_id,
            kind=ImportBatch.Kind.TIME_ENTRIES,
            created_by=request.user,
            source_filename=source_filename,
        )

        created_ids: list[int] = []
        errors: list[dict] = []

        for idx, raw in enumerate(rows, start=1):
            row_label = raw.get('row_label') or f'Row {idx}'
            project_name = (raw.get('project') or '').strip()
            task_name = (raw.get('task') or '').strip()
            person_ref = (raw.get('person') or '').strip()
            hours_raw = raw.get('hours')
            date_raw = raw.get('date') or ''
            notes = (raw.get('notes') or '').strip()
            billable_raw = raw.get('billable')

            # Try exact match, then bracket-stripped fallback (handles Harvest CSVs
            # that strip our [SAMPLE] prefix from project names).
            project = None
            if project_name:
                key = project_name.strip().lower()
                project = projects.get(key) or projects_alt.get(key) or projects_alt.get(_strip_prefix(project_name))
            if not project:
                hint = ''
                suggestions = _suggest_names(project_name, all_project_names)
                if suggestions:
                    hint = f' Did you mean: {", ".join(repr(s) for s in suggestions)}?'
                errors.append({
                    'row': row_label,
                    'error': f'Project not found: "{project_name}".{hint}',
                })
                continue

            project_task = None
            if task_name:
                tkey = task_name.strip().lower()
                project_task = (
                    project_tasks.get((project.id, tkey))
                    or project_tasks_alt.get((project.id, tkey))
                    or project_tasks_alt.get((project.id, _strip_prefix(task_name)))
                )
            if not project_task:
                # Tasks defined on this project (full names) for the suggestion.
                proj_task_names = [
                    pt_obj.task.name
                    for (pid, _), pt_obj in project_tasks.items()
                    if pid == project.id
                ]
                hint = ''
                suggestions = _suggest_names(task_name, proj_task_names)
                if suggestions:
                    hint = f' Did you mean: {", ".join(repr(s) for s in suggestions)}?'
                errors.append({
                    'row': row_label,
                    'error': f'Task not found on project "{project.name}": "{task_name}".{hint}',
                })
                continue

            user_obj = None
            if person_ref:
                user_obj = users_by_email.get(person_ref.lower()) or users_by_name.get(person_ref.lower())
                if not user_obj:
                    errors.append({'row': row_label, 'error': f'Person not found: "{person_ref}"'})
                    continue
            else:
                user_obj = request.user

            parsed_date = _parse_import_date(date_raw)
            if not parsed_date:
                errors.append({'row': row_label, 'error': f'Invalid date: "{date_raw}"'})
                continue

            try:
                hours = Decimal(str(hours_raw)) if hours_raw is not None else Decimal('0')
            except (_InvalidOp, ValueError):
                errors.append({'row': row_label, 'error': f'Invalid hours: "{hours_raw}"'})
                continue
            if hours < 0 or hours > Decimal('24'):
                errors.append({'row': row_label, 'error': 'Hours must be 0-24.'})
                continue

            if billable_raw is None:
                is_billable = project_task.is_billable
            elif isinstance(billable_raw, bool):
                is_billable = billable_raw
            else:
                is_billable = str(billable_raw).strip().lower() in ('1', 'true', 'yes', 'y', 'billable')

            entry = TimeEntry.objects.create(
                account_id=account_id,
                user=user_obj,
                project=project,
                project_task=project_task,
                date=parsed_date,
                hours=hours,
                notes=notes,
                is_billable=is_billable,
                import_batch=batch,
            )
            created_ids.append(entry.id)

        batch.record_count = len(created_ids)
        date_min = None
        date_max = None
        if not created_ids:
            # Empty batch — clean up so it never shows in the revert list.
            batch.delete()
            batch_payload = None
        else:
            batch.save(update_fields=['record_count'])
            batch_payload = ImportBatchSerializer(batch).data
            from django.db.models import Max, Min
            agg = batch.time_entries.aggregate(min_d=Min('date'), max_d=Max('date'))
            date_min = agg['min_d'].isoformat() if agg['min_d'] else None
            date_max = agg['max_d'].isoformat() if agg['max_d'] else None

        return Response({
            'created': len(created_ids),
            'errors': errors,
            'batch': batch_payload,
            'date_range': {'start': date_min, 'end': date_max},
        })


class ImportBatchListView(APIView):
    """GET /api/v1/imports/ — list past import batches for this workspace."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('owner', 'admin'):
            return Response(
                {'detail': 'Only owners and admins can view imports.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        batches = ImportBatch.objects.filter(account_id=request.user.account_id)
        return Response(ImportBatchSerializer(batches, many=True).data)


class ImportBatchRevertView(APIView):
    """DELETE /api/v1/imports/<id>/ — revert (delete every row created by this batch)."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if request.user.role not in ('owner', 'admin'):
            return Response(
                {'detail': 'Only owners and admins can revert imports.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        batch = ImportBatch.objects.filter(
            id=pk, account_id=request.user.account_id,
        ).first()
        if not batch:
            return Response({'detail': 'Import not found.'}, status=status.HTTP_404_NOT_FOUND)

        deleted_count = batch.time_entries.count()
        batch.time_entries.all().delete()
        batch.delete()
        return Response({'reverted': deleted_count})
