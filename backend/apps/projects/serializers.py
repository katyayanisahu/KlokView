from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Q, Sum
from rest_framework import serializers

from apps.clients.models import Client
from .models import Project, ProjectMembership, ProjectTask, Task

User = get_user_model()


def _sum_hours(queryset) -> Decimal:
    """Sum the hours field on a TimeEntry queryset, returning Decimal('0') if empty."""
    total = queryset.aggregate(total=Sum('hours'))['total']
    return total if total is not None else Decimal('0')


def _current_week_bounds() -> tuple[date, date]:
    """Monday–Sunday of the current week."""
    today = date.today()
    start = today - timedelta(days=today.weekday())
    return start, start + timedelta(days=6)


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = (
            'id', 'name', 'is_default', 'default_is_billable',
            'default_billable_rate', 'is_active',
        )
        read_only_fields = ('id',)


class ProjectTaskSerializer(serializers.ModelSerializer):
    task_id = serializers.PrimaryKeyRelatedField(
        queryset=Task.objects.filter(is_active=True), source='task'
    )
    task_name = serializers.CharField(source='task.name', read_only=True)
    hours_logged = serializers.SerializerMethodField()

    class Meta:
        model = ProjectTask
        fields = ('id', 'task_id', 'task_name', 'is_billable', 'billable_rate', 'hours_logged')
        read_only_fields = ('id', 'task_name', 'hours_logged')

    def get_hours_logged(self, obj) -> str:
        return f'{_sum_hours(obj.time_entries.all()):.2f}'


class ProjectMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), source='user', write_only=True
    )
    user = serializers.SerializerMethodField(read_only=True)
    hours_logged = serializers.SerializerMethodField()

    class Meta:
        model = ProjectMembership
        fields = ('id', 'user_id', 'user', 'hourly_rate', 'is_project_manager', 'hours_logged')
        read_only_fields = ('id', 'user', 'hours_logged')

    def get_user(self, obj):
        return {
            'id': obj.user.id,
            'email': obj.user.email,
            'full_name': obj.user.full_name,
            'role': obj.user.role,
            'weekly_capacity_hours': str(obj.user.weekly_capacity_hours or 0),
        }

    def get_hours_logged(self, obj) -> str:
        from apps.timesheets.models import TimeEntry

        total = _sum_hours(
            TimeEntry.objects.filter(project_id=obj.project_id, user_id=obj.user_id)
        )
        return f'{total:.2f}'


class ProjectListSerializer(serializers.ModelSerializer):
    """Light payload for list page."""
    client_id = serializers.IntegerField(source='client.id', read_only=True)
    client_name = serializers.CharField(source='client.name', read_only=True)
    manager_ids = serializers.SerializerMethodField()
    spent_amount = serializers.SerializerMethodField()
    cost_amount = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            'id', 'name', 'code', 'client_id', 'client_name',
            'project_type', 'budget_type', 'budget_amount',
            'billable_rate_strategy', 'flat_billable_rate',
            'manager_ids', 'spent_amount', 'cost_amount',
            'is_active', 'created_at',
        )
        read_only_fields = fields

    def get_manager_ids(self, obj) -> list[int]:
        return list(
            obj.memberships.filter(is_project_manager=True).values_list('user_id', flat=True)
        )

    def get_spent_amount(self, obj) -> str:
        # `spent_hours` is annotated on the queryset by ProjectViewSet.list.
        # Fall back to a per-row aggregate if missing (defensive — keeps detail use working).
        annotated = getattr(obj, 'spent_hours', None)
        if annotated is not None:
            return f'{annotated:.2f}'
        return f'{_sum_hours(obj.time_entries.all()):.2f}'

    def get_cost_amount(self, obj) -> str:
        # Sum of (hours × user.cost_rate) across all time entries on this project.
        # Cost rate lives on the user — Profitability report depends on this.
        annotated = getattr(obj, 'cost_amount_db', None)
        if annotated is not None:
            return f'{annotated:.2f}'
        total = Decimal('0')
        for entry in obj.time_entries.select_related('user').all():
            total += (entry.hours or Decimal('0')) * (entry.user.cost_rate or Decimal('0'))
        return f'{total:.2f}'


class ProjectDetailSerializer(serializers.ModelSerializer):
    client_id = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.filter(is_active=True), source='client'
    )
    client_name = serializers.CharField(source='client.name', read_only=True)
    project_tasks = ProjectTaskSerializer(many=True, read_only=True)
    memberships = ProjectMemberSerializer(many=True, read_only=True)
    total_hours_logged = serializers.SerializerMethodField()
    billable_hours_logged = serializers.SerializerMethodField()
    non_billable_hours_logged = serializers.SerializerMethodField()
    hours_this_week = serializers.SerializerMethodField()
    avg_hours_per_week = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            'id', 'name', 'code', 'client_id', 'client_name',
            'start_date', 'end_date', 'notes',
            'visibility', 'project_type',
            'budget_type', 'budget_amount', 'budget_resets_monthly',
            'budget_includes_non_billable', 'budget_alert_percent',
            'billable_rate_strategy', 'flat_billable_rate',
            'is_active', 'project_tasks', 'memberships',
            'total_hours_logged', 'billable_hours_logged', 'non_billable_hours_logged',
            'hours_this_week', 'avg_hours_per_week',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'client_name', 'project_tasks', 'memberships',
            'total_hours_logged', 'billable_hours_logged', 'non_billable_hours_logged',
            'hours_this_week', 'avg_hours_per_week',
            'created_at', 'updated_at',
        )

    def get_total_hours_logged(self, obj) -> str:
        return f'{_sum_hours(obj.time_entries.all()):.2f}'

    def get_billable_hours_logged(self, obj) -> str:
        return f'{_sum_hours(obj.time_entries.filter(is_billable=True)):.2f}'

    def get_non_billable_hours_logged(self, obj) -> str:
        return f'{_sum_hours(obj.time_entries.filter(is_billable=False)):.2f}'

    def get_hours_this_week(self, obj) -> str:
        start, end = _current_week_bounds()
        qs = obj.time_entries.filter(date__gte=start, date__lte=end)
        return f'{_sum_hours(qs):.2f}'

    def get_avg_hours_per_week(self, obj) -> str:
        # Average over the last 4 weeks (28 days), excluding the current week.
        today = date.today()
        end = today - timedelta(days=today.weekday() + 1)  # last Sunday
        start = end - timedelta(days=27)
        qs = obj.time_entries.filter(date__gte=start, date__lte=end)
        total = _sum_hours(qs)
        return f'{(total / Decimal(4)):.2f}' if total else '0.00'


class ProjectCreateSerializer(serializers.ModelSerializer):
    """Used for POST — accepts task_ids and member entries inline."""
    client_id = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.filter(is_active=True), source='client'
    )
    task_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True
    )
    task_rates = serializers.DictField(
        child=serializers.CharField(allow_blank=True, allow_null=True, required=False),
        required=False, write_only=True,
        help_text='Optional per-task billable rate overrides. Keys = task IDs (as strings), values = decimal strings or null.',
    )
    members = serializers.ListField(
        child=serializers.DictField(), required=False, write_only=True
    )

    def validate_client_id(self, client):
        request = self.context.get('request')
        if request and request.user.is_authenticated and client.account_id != request.user.account_id:
            raise serializers.ValidationError('Client not found in your account.')
        return client

    class Meta:
        model = Project
        fields = (
            'id', 'name', 'code', 'client_id',
            'start_date', 'end_date', 'notes',
            'visibility', 'project_type',
            'budget_type', 'budget_amount', 'budget_resets_monthly',
            'budget_includes_non_billable', 'budget_alert_percent',
            'billable_rate_strategy', 'flat_billable_rate',
            'is_active',
            'task_ids', 'task_rates', 'members',
        )
        read_only_fields = ('id',)

    def create(self, validated_data):
        task_ids = validated_data.pop('task_ids', None)
        task_rates = validated_data.pop('task_rates', {}) or {}
        members_data = validated_data.pop('members', [])
        project = Project.objects.create(**validated_data)

        account_id = project.account_id
        if task_ids is None:
            task_ids = list(
                Task.objects.filter(
                    account_id=account_id, is_default=True, is_active=True
                ).values_list('id', flat=True)
            )
        valid_task_ids = set(
            Task.objects.filter(account_id=account_id, id__in=task_ids).values_list('id', flat=True)
        )
        for task_id in valid_task_ids:
            override_rate = task_rates.get(str(task_id))
            if override_rate in ('', None):
                override_rate = None
            ProjectTask.objects.get_or_create(
                project=project,
                task_id=task_id,
                defaults={'billable_rate': override_rate},
            )

        for entry in members_data:
            user_id = entry.get('user_id')
            if not user_id:
                continue
            # only allow assigning users from the same account
            if not project.account.users.filter(id=user_id).exists():
                continue
            ProjectMembership.objects.get_or_create(
                project=project,
                user_id=user_id,
                defaults={
                    'hourly_rate': entry.get('hourly_rate'),
                    'is_project_manager': entry.get('is_project_manager', False),
                },
            )
        return project
