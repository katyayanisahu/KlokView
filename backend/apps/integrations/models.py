"""Integration models — currently Outlook calendar.

Tokens are stored encrypted at rest. The encryption key is derived from
Django's SECRET_KEY so no extra secret management is required for MVP. If
SECRET_KEY ever rotates, existing connections will fail to decrypt and users
will need to reconnect.
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plain: str) -> str:
    if not plain:
        return ''
    return _fernet().encrypt(plain.encode('utf-8')).decode('utf-8')


def decrypt(token: str) -> str:
    if not token:
        return ''
    try:
        return _fernet().decrypt(token.encode('utf-8')).decode('utf-8')
    except InvalidToken:
        return ''


class OutlookConnection(models.Model):
    """One MS account per TrackFlow user."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='outlook_connection',
    )
    ms_account_email = models.EmailField()
    access_token_encrypted = models.TextField()
    refresh_token_encrypted = models.TextField()
    token_expires_at = models.DateTimeField()
    scope = models.TextField(blank=True, default='')
    connected_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'outlook_connections'

    def __str__(self) -> str:
        return f'{self.user_id} → {self.ms_account_email}'

    @property
    def access_token(self) -> str:
        return decrypt(self.access_token_encrypted)

    @access_token.setter
    def access_token(self, value: str) -> None:
        self.access_token_encrypted = encrypt(value)

    @property
    def refresh_token(self) -> str:
        return decrypt(self.refresh_token_encrypted)

    @refresh_token.setter
    def refresh_token(self, value: str) -> None:
        self.refresh_token_encrypted = encrypt(value)


class JiraConnection(models.Model):
    """One Jira Cloud site per TrackFlow account.

    Atlassian's Connect/Forge install lifecycle posts a `clientKey` and
    `sharedSecret` when the app is installed on a Jira site; we store both
    here. Inbound requests from the Forge panel arrive with a JWT signed by
    that secret, which `JiraJWTAuthentication` verifies.

    The `account` field is nullable because the Atlassian lifecycle webhook
    (POST /installed/) fires before any TrackFlow user has linked the Jira
    site. We persist the connection row first; a TrackFlow admin then claims
    it from Settings → Integrations, which sets `account_id`.
    """

    account = models.ForeignKey(
        'accounts.Account', on_delete=models.CASCADE,
        related_name='jira_connections',
        null=True, blank=True,
    )
    # The TrackFlow user whose name is used when entries are logged from
    # the Jira side. Auto-set to the workspace's first owner/admin during
    # the Forge bootstrap call; can be changed later from Settings.
    default_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='jira_default_for_connections',
    )
    # Atlassian-issued identifiers from the install handshake.
    client_key = models.CharField(max_length=255, unique=True)
    base_url = models.URLField(max_length=512)
    product_type = models.CharField(max_length=50, blank=True, default='')
    description = models.TextField(blank=True, default='')
    shared_secret_encrypted = models.TextField(blank=True, default='')

    connected_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'jira_connections'
        indexes = [
            models.Index(fields=['account']),
        ]

    def __str__(self) -> str:
        return f'{self.client_key} → {self.base_url}'

    @property
    def shared_secret(self) -> str:
        return decrypt(self.shared_secret_encrypted)

    @shared_secret.setter
    def shared_secret(self, value: str) -> None:
        self.shared_secret_encrypted = encrypt(value)


class ImportedCalendarEvent(models.Model):
    """Tracks which Outlook calendar events have already been pulled into
    TrackFlow as time entries — so the picker can gray them out and prevent
    double-imports.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='imported_calendar_events',
    )
    outlook_event_id = models.CharField(max_length=512)
    time_entry = models.ForeignKey(
        'timesheets.TimeEntry',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='imported_from_outlook',
    )
    event_subject = models.CharField(max_length=512, blank=True, default='')
    event_start = models.DateTimeField(null=True, blank=True)
    event_end = models.DateTimeField(null=True, blank=True)
    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'imported_calendar_events'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'outlook_event_id'],
                name='uniq_user_outlook_event',
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'event_start']),
        ]
