from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import merged_notification_prefs
from apps.accounts.permissions import IsOwnerOrAdminForWrite
from apps.accounts.tenant import TenantScopedMixin

from .models import Project, ProjectMembership, ProjectTask, Task

User = get_user_model()


def _notify_project_deleted(project: Project, deleter) -> None:
    """Email project managers + workspace owners/admins when project is hard-deleted."""
    manager_ids = set(
        ProjectMembership.objects.filter(
            project_id=project.id, is_project_manager=True,
        ).values_list('user_id', flat=True)
    )
    recipients = (
        User.objects.filter(account_id=project.account_id, is_active=True)
        .filter(Q(role__in=['owner', 'admin']) | Q(id__in=manager_ids))
        .exclude(id=getattr(deleter, 'id', None))
        .distinct()
    )

    emails = []
    for user in recipients:
        prefs = merged_notification_prefs(user)
        if prefs.get('project_deleted_email'):
            emails.append(user.email)
    if not emails:
        return

    deleter_name = (
        (deleter.full_name or deleter.email) if deleter else 'A workspace admin'
    )
    subject = f'[TrackFlow] Project "{project.name}" was deleted'
    body = (
        f"Hi,\n\n"
        f"{deleter_name} deleted the project \"{project.name}\".\n\n"
        f"All time entries, tasks, and memberships associated with this project "
        f"have been removed.\n\n"
        f"— TrackFlow"
    )
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=emails,
        fail_silently=not settings.DEBUG,
    )
from .serializers import (
    ProjectCreateSerializer,
    ProjectDetailSerializer,
    ProjectListSerializer,
    ProjectMemberSerializer,
    ProjectTaskSerializer,
    TaskSerializer,
)


class TaskViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """Global task library — workspace-scoped."""
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [IsOwnerOrAdminForWrite]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.role not in ('owner', 'admin'):
            qs = qs.filter(project_tasks__project__memberships__user=user).distinct()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('true', '1', 'yes'))
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)
        return qs

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        hard = request.query_params.get('hard', '').lower() in ('true', '1', 'yes')
        if hard:
            name = task.name
            task.delete()
            return Response({'detail': f'"{name}" deleted.'}, status=status.HTTP_200_OK)
        task.is_active = False
        task.save(update_fields=['is_active', 'updated_at'])
        return Response({'detail': f'"{task.name}" archived.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='restore')
    def restore(self, request, pk=None):
        if request.user.role not in ('owner', 'admin'):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        task = self.get_object()
        task.is_active = True
        task.save(update_fields=['is_active', 'updated_at'])
        return Response(TaskSerializer(task).data)


class ProjectViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Project.objects.select_related('client').prefetch_related(
        'project_tasks__task', 'memberships__user'
    )
    permission_classes = [IsOwnerOrAdminForWrite]

    def get_serializer_class(self):
        if self.action == 'list':
            return ProjectListSerializer
        if self.action == 'create':
            return ProjectCreateSerializer
        return ProjectDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.role not in ('owner', 'admin'):
            qs = qs.filter(memberships__user=user).distinct()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('true', '1', 'yes'))
        client_id = self.request.query_params.get('client_id')
        if client_id:
            qs = qs.filter(client_id=client_id)
        manager_id = self.request.query_params.get('manager_id')
        if manager_id:
            qs = qs.filter(
                memberships__user_id=manager_id,
                memberships__is_project_manager=True,
            ).distinct()
        project_type = self.request.query_params.get('project_type')
        if project_type:
            qs = qs.filter(project_type=project_type)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(code__icontains=search)
                | Q(client__name__icontains=search)
            )
        if self.action == 'list':
            # Optional period filter for the Spent column. When start/end are
            # absent, the Sum runs across all time entries (lifetime).
            start_date = self.request.query_params.get('start_date')
            end_date = self.request.query_params.get('end_date')
            time_filter = Q()
            if start_date:
                time_filter &= Q(time_entries__date__gte=start_date)
            if end_date:
                time_filter &= Q(time_entries__date__lte=end_date)
            qs = qs.annotate(
                spent_hours=Coalesce(
                    Sum('time_entries__hours', filter=time_filter) if time_filter
                    else Sum('time_entries__hours'),
                    Value(Decimal('0')),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        project = self.get_object()
        hard = request.query_params.get('hard', '').lower() in ('true', '1', 'yes')
        if hard:
            name = project.name
            # Notify before delete — cascade wipes memberships needed for recipient query.
            try:
                _notify_project_deleted(project, request.user)
            except Exception:
                pass
            project.delete()
            return Response({'detail': f'"{name}" deleted.'}, status=status.HTTP_200_OK)
        project.is_active = False
        project.save(update_fields=['is_active', 'updated_at'])
        return Response({'detail': f'"{project.name}" archived.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='restore')
    def restore(self, request, pk=None):
        if request.user.role not in ('owner', 'admin'):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        project = self.get_object()
        project.is_active = True
        project.save(update_fields=['is_active', 'updated_at'])
        return Response(ProjectDetailSerializer(project).data)

    @action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        if request.user.role not in ('owner', 'admin'):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        original = self.get_object()
        copy = Project.objects.create(
            account=original.account,
            client=original.client,
            name=f'{original.name} (copy)',
            code=original.code,
            start_date=original.start_date,
            end_date=original.end_date,
            notes=original.notes,
            visibility=original.visibility,
            project_type=original.project_type,
            budget_type=original.budget_type,
            budget_amount=original.budget_amount,
            budget_resets_monthly=original.budget_resets_monthly,
            budget_includes_non_billable=original.budget_includes_non_billable,
            budget_alert_percent=original.budget_alert_percent,
            billable_rate_strategy=original.billable_rate_strategy,
            flat_billable_rate=original.flat_billable_rate,
            is_active=True,
        )
        for pt in original.project_tasks.all():
            ProjectTask.objects.create(
                project=copy, task=pt.task,
                is_billable=pt.is_billable, billable_rate=pt.billable_rate,
            )
        for pm in original.memberships.all():
            ProjectMembership.objects.create(
                project=copy,
                user=pm.user,
                hourly_rate=pm.hourly_rate,
                is_project_manager=pm.is_project_manager,
            )
        return Response(ProjectDetailSerializer(copy).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'], url_path='tasks')
    def tasks(self, request, pk=None):
        project = self.get_object()
        if request.method == 'GET':
            serializer = ProjectTaskSerializer(project.project_tasks.all(), many=True)
            return Response(serializer.data)
        if request.user.role not in ('owner', 'admin'):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = ProjectTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = serializer.validated_data['task']
        defaults = {'is_billable': serializer.validated_data.get('is_billable', True)}
        if 'billable_rate' in serializer.validated_data:
            defaults['billable_rate'] = serializer.validated_data['billable_rate']
        pt, created = ProjectTask.objects.update_or_create(
            project=project, task=task,
            defaults=defaults,
        )
        return Response(
            ProjectTaskSerializer(pt).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['delete'], url_path=r'tasks/(?P<task_id>\d+)')
    def remove_task(self, request, pk=None, task_id=None):
        if request.user.role not in ('owner', 'admin'):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        project = self.get_object()
        deleted, _ = ProjectTask.objects.filter(project=project, task_id=task_id).delete()
        if not deleted:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get', 'post'], url_path='members')
    def members(self, request, pk=None):
        project = self.get_object()
        if request.method == 'GET':
            serializer = ProjectMemberSerializer(project.memberships.select_related('user'), many=True)
            return Response(serializer.data)
        if request.user.role not in ('owner', 'admin'):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = ProjectMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        pm, created = ProjectMembership.objects.update_or_create(
            project=project, user=user,
            defaults={
                'hourly_rate': serializer.validated_data.get('hourly_rate'),
                'is_project_manager': serializer.validated_data.get('is_project_manager', False),
            },
        )
        return Response(
            ProjectMemberSerializer(pm).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['delete'], url_path=r'members/(?P<user_id>\d+)')
    def remove_member(self, request, pk=None, user_id=None):
        if request.user.role not in ('owner', 'admin'):
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        project = self.get_object()
        deleted, _ = ProjectMembership.objects.filter(project=project, user_id=user_id).delete()
        if not deleted:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
