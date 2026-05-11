from decimal import Decimal, InvalidOperation

from rest_framework import serializers

from apps.projects.models import Project, ProjectTask

from .models import ImportBatch, Submission, TimeEntry


def parse_hours_input(value) -> Decimal:
    """Accept either a decimal number ("1.5") or H:MM ("1:30") and return Decimal hours."""
    if value is None or value == '':
        return Decimal('0.00')
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value))
    s = str(value).strip()
    if ':' in s:
        try:
            h_str, m_str = s.split(':', 1)
            h = int(h_str or 0)
            m = int(m_str or 0)
            if m < 0 or m >= 60:
                raise ValueError('Minutes must be 0–59.')
            return Decimal(h) + (Decimal(m) / Decimal(60))
        except (ValueError, InvalidOperation) as exc:
            raise serializers.ValidationError(f'Invalid hours format: {exc}')
    try:
        return Decimal(s)
    except InvalidOperation:
        raise serializers.ValidationError('Hours must be a number or H:MM.')


class TimeEntrySerializer(serializers.ModelSerializer):
    """Read + write serializer for a single time entry."""

    user_id = serializers.IntegerField(read_only=True)
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    project_id = serializers.PrimaryKeyRelatedField(
        source='project', queryset=Project.objects.all(),
    )
    project_task_id = serializers.PrimaryKeyRelatedField(
        source='project_task', queryset=ProjectTask.objects.all(),
    )
    project_name = serializers.CharField(source='project.name', read_only=True)
    client_name = serializers.CharField(source='project.client.name', read_only=True)
    task_name = serializers.CharField(source='project_task.task.name', read_only=True)
    hours = serializers.CharField(required=False)
    jira_issue_key = serializers.CharField(
        required=False, allow_blank=True, max_length=50,
    )

    class Meta:
        model = TimeEntry
        fields = (
            'id',
            'user_id', 'user_name',
            'project_id', 'project_name', 'client_name',
            'project_task_id', 'task_name',
            'date', 'hours', 'notes', 'is_billable',
            'jira_issue_key',
            'is_running', 'started_at',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'user_id', 'user_name', 'project_name', 'client_name',
            'task_name', 'is_running', 'started_at', 'created_at', 'updated_at',
        )

    def validate(self, attrs):
        request = self.context.get('request')
        account_id = request.user.account_id if request else None

        project = attrs.get('project') or (self.instance.project if self.instance else None)
        project_task = attrs.get('project_task') or (
            self.instance.project_task if self.instance else None
        )

        if project and account_id and project.account_id != account_id:
            raise serializers.ValidationError({'project_id': 'Project not in your workspace.'})
        if project_task and project and project_task.project_id != project.id:
            raise serializers.ValidationError(
                {'project_task_id': 'Task does not belong to this project.'},
            )

        if 'hours' in attrs:
            hours = parse_hours_input(attrs['hours'])
            if hours < 0:
                raise serializers.ValidationError({'hours': 'Hours cannot be negative.'})
            if hours > Decimal('24'):
                raise serializers.ValidationError(
                    {'hours': 'A single entry cannot exceed 24 hours.'},
                )
            attrs['hours'] = hours

        # Normalize Jira issue key — uppercase + strip, so "proj-123 " == "PROJ-123".
        if 'jira_issue_key' in attrs:
            attrs['jira_issue_key'] = (attrs.get('jira_issue_key') or '').strip().upper()

        return attrs

    def create(self, validated_data):
        request = self.context['request']
        validated_data['user'] = request.user
        validated_data['account_id'] = request.user.account_id
        # Snapshot billable from project_task unless the caller explicitly set it.
        if 'is_billable' not in validated_data and validated_data.get('project_task'):
            validated_data['is_billable'] = validated_data['project_task'].is_billable
        return super().create(validated_data)


class SubmissionSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(read_only=True)
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    decided_by_name = serializers.CharField(source='decided_by.full_name', read_only=True)
    total_hours = serializers.SerializerMethodField()
    billable_hours = serializers.SerializerMethodField()
    entry_count = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            'id',
            'user_id', 'user_name', 'user_email',
            'start_date', 'end_date',
            'status', 'submitted_at',
            'decided_at', 'decided_by', 'decided_by_name', 'decision_note',
            'total_hours', 'billable_hours', 'entry_count',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'user_id', 'user_name', 'user_email', 'status', 'submitted_at',
            'decided_at', 'decided_by', 'decided_by_name', 'decision_note',
            'total_hours', 'billable_hours', 'entry_count',
            'created_at', 'updated_at',
        )

    def _entry_qs(self, obj):
        return TimeEntry.objects.filter(
            user_id=obj.user_id,
            date__gte=obj.start_date,
            date__lte=obj.end_date,
        )

    def get_total_hours(self, obj) -> str:
        from django.db.models import Sum

        total = self._entry_qs(obj).aggregate(t=Sum('hours'))['t']
        return f'{(total or Decimal("0")):.2f}'

    def get_billable_hours(self, obj) -> str:
        from django.db.models import Sum

        total = self._entry_qs(obj).filter(is_billable=True).aggregate(t=Sum('hours'))['t']
        return f'{(total or Decimal("0")):.2f}'

    def get_entry_count(self, obj) -> int:
        return self._entry_qs(obj).count()


class SubmissionCreateSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()

    def validate(self, attrs):
        if attrs['end_date'] < attrs['start_date']:
            raise serializers.ValidationError(
                {'end_date': 'End date must be on or after start date.'},
            )
        return attrs


class SubmissionDecisionSerializer(serializers.Serializer):
    decision_note = serializers.CharField(required=False, allow_blank=True, default='')


class ImportBatchSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    created_by_email = serializers.CharField(source='created_by.email', read_only=True)
    surviving_record_count = serializers.SerializerMethodField()

    class Meta:
        model = ImportBatch
        fields = (
            'id', 'kind', 'record_count', 'surviving_record_count',
            'source_filename', 'note',
            'created_by', 'created_by_name', 'created_by_email',
            'created_at',
        )
        read_only_fields = fields

    def get_surviving_record_count(self, obj) -> int:
        # How many of the original imported rows still exist (none are deleted via revert)
        return obj.time_entries.count()
