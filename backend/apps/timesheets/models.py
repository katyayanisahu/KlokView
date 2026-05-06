from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Submission(models.Model):
    """A user's timesheet submission for a date range, awaiting / approved / rejected.

    While a submission is `submitted` or `approved`, time entries inside its
    [start_date, end_date] are locked from member edits. Managers / admins
    can still edit (US-12 + Epic 6 override). Rejected submissions don't lock —
    they signal that the user needs to revise and resubmit.
    """

    class Status(models.TextChoices):
        SUBMITTED = 'submitted', 'Submitted'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    account = models.ForeignKey(
        'accounts.Account', on_delete=models.CASCADE, related_name='submissions',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='submissions',
    )
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.SUBMITTED,
    )
    submitted_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='decided_submissions',
    )
    decision_note = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'submissions'
        ordering = ['-submitted_at']
        indexes = [
            models.Index(fields=['account', 'user', 'start_date', 'end_date']),
            models.Index(fields=['account', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.user_id} · {self.start_date}…{self.end_date} · {self.status}'

    def clean(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({'end_date': 'End date must be on or after start date.'})

    @property
    def locks_entries(self) -> bool:
        return self.status in (self.Status.SUBMITTED, self.Status.APPROVED)


class TimeEntry(models.Model):
    """A single block of time logged by a user against a project + task on a date.

    Hours are stored as decimal (e.g. 1.50 = 1h30m). For timers, `is_running=True`
    and `started_at` holds the wall-clock start time; on stop, the elapsed delta
    is committed to `hours` and `is_running` flips to False.
    """

    account = models.ForeignKey(
        'accounts.Account', on_delete=models.CASCADE, related_name='time_entries',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='time_entries',
    )
    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE, related_name='time_entries',
    )
    project_task = models.ForeignKey(
        'projects.ProjectTask', on_delete=models.CASCADE, related_name='time_entries',
    )
    date = models.DateField()
    hours = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
    )
    notes = models.TextField(blank=True, default='')
    is_billable = models.BooleanField(default=True)

    # Optional Jira issue this entry is logged against (e.g. "PROJ-123").
    # Used by the Jira Forge App + Time-page tagging — see Docs/Jira_Integration_v2_Django.
    jira_issue_key = models.CharField(max_length=50, blank=True, default='')

    is_running = models.BooleanField(default=False)
    started_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'time_entries'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['account', 'user', 'date']),
            models.Index(fields=['account', 'project', 'date']),
            models.Index(fields=['account', 'jira_issue_key']),
        ]

    def __str__(self) -> str:
        return f'{self.user_id} · {self.project_id} · {self.date} · {self.hours}h'

    def clean(self):
        if self.hours is not None and self.hours < 0:
            raise ValidationError({'hours': 'Hours cannot be negative.'})
        if self.hours is not None and self.hours > Decimal('24'):
            raise ValidationError({'hours': 'A single entry cannot exceed 24 hours.'})
        if self.project_task_id and self.project_id and self.project_task.project_id != self.project_id:
            raise ValidationError({'project_task': 'Task does not belong to this project.'})
