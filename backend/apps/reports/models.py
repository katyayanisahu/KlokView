from django.conf import settings
from django.db import models


class SavedReport(models.Model):
    """A saved report configuration — name + filter params for any of the report tabs."""

    class Kind(models.TextChoices):
        TIME = 'time', 'Time'
        PROFITABILITY = 'profitability', 'Profitability'
        DETAILED_TIME = 'detailed_time', 'Detailed Time'
        ACTIVITY = 'activity', 'Activity Log'

    account = models.ForeignKey(
        'accounts.Account', on_delete=models.CASCADE, related_name='saved_reports',
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='saved_reports',
    )
    name = models.CharField(max_length=150)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    filters = models.JSONField(default=dict, blank=True)
    is_shared = models.BooleanField(
        default=False,
        help_text='When true, all admins/owners in the workspace can see this report.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'saved_reports'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['account', 'owner']),
            models.Index(fields=['account', 'kind']),
        ]

    def __str__(self) -> str:
        return f'{self.name} ({self.kind})'
