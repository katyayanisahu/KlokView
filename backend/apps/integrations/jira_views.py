"""HTTP endpoints for the TrackFlow Jira Forge App.

Two flavors of caller:

1. The **Forge App panel** running inside Jira issues — authenticates with a
   Jira-signed JWT (`JiraJWTAuthentication`). Hits `/start/`, `/stop/`,
   `/entries/`.
2. The **Atlassian install lifecycle** — unauthenticated POSTs to
   `/installed/` and `/uninstalled/` from Atlassian itself when the app is
   installed/removed on a Jira site. We must accept these without auth and
   verify the payload's `sharedSecret`/`clientKey` server-side.
3. **Logged-in TrackFlow users** — read-only `GET /status/` from the
   Settings → Integrations page (uses standard JWT user auth).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from decouple import config as env
from django.contrib.auth import get_user_model
from django.utils import timezone as djtz
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.models import Project, ProjectTask
from apps.timesheets.models import TimeEntry
from apps.timesheets.serializers import TimeEntrySerializer

User = get_user_model()


def _pick_default_user():
    """Pick which TrackFlow user to attribute Jira-side time logs to.

    Priority:
    1. JIRA_DEFAULT_USER_EMAIL env var (dev override) — matches the user
       installing the Forge app in their own dev workspace.
    2. First owner by id, then first admin — fallback for fresh installs.

    Returns a User instance or None if the workspace has no owner/admin.
    """
    email = env('JIRA_DEFAULT_USER_EMAIL', default='', cast=str).strip()
    if email:
        match = User.objects.filter(email__iexact=email).first()
        if match is not None:
            return match
    return (
        User.objects.filter(role='owner').order_by('id').first()
        or User.objects.filter(role='admin').order_by('id').first()
    )

from .jira_auth import JiraJWTAuthentication
from .models import JiraConnection


# ---------- 1. Atlassian install lifecycle (unauthenticated) ----------

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def jira_installed(request):
    """Called by Atlassian when our Forge app is installed on a Jira site.

    Payload (Atlassian Connect spec):
      { "key", "clientKey", "sharedSecret", "baseUrl", "productType", ... }

    We upsert a JiraConnection keyed by `clientKey`. The TrackFlow account
    isn't known yet — a TrackFlow admin claims this connection later via
    Settings → Integrations.
    """
    payload = request.data or {}
    client_key = payload.get('clientKey')
    shared_secret = payload.get('sharedSecret')
    base_url = payload.get('baseUrl')

    if not client_key or not shared_secret or not base_url:
        return Response(
            {'detail': 'Missing clientKey, sharedSecret, or baseUrl.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    conn, _created = JiraConnection.objects.get_or_create(
        client_key=client_key,
        defaults={
            'base_url': base_url,
            'shared_secret_encrypted': '',
            'product_type': payload.get('productType', '') or '',
            'description': payload.get('description', '') or '',
        },
    )
    # Always refresh secret + base_url — Atlassian may rotate the secret on
    # reinstall.
    conn.base_url = base_url
    conn.product_type = payload.get('productType', '') or conn.product_type
    conn.description = payload.get('description', '') or conn.description
    conn.shared_secret = shared_secret
    conn.save()

    return Response({'status': 'ok'})


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def jira_uninstalled(request):
    """Called by Atlassian when the Forge app is removed from a Jira site."""
    client_key = (request.data or {}).get('clientKey')
    if not client_key:
        return Response({'detail': 'Missing clientKey.'}, status=status.HTTP_400_BAD_REQUEST)

    JiraConnection.objects.filter(client_key=client_key).delete()
    return Response({'status': 'ok'})


# ---------- 2. Forge panel endpoints (Jira JWT auth) ----------

class JiraEntriesView(APIView):
    """GET /api/integrations/jira/entries/?issue_key=SCRUM-5

    Returns KlokView time entries already logged against this Jira issue.
    This is the "event log" the Forge panel renders inside the issue, just
    like the Harvest panel.

    Auth strategy (v1):
    - If a `JiraConnection` is claimed by an account, scope entries to that
      account. The Forge tunnel does NOT send a real Jira JWT in dev, so we
      can't verify a signed token — instead, we trust the request locally
      and rely on the connection-table claim to determine scope.
    - Production hardening: re-add JiraJWTAuthentication once the install
      lifecycle webhook is wired (Atlassian Marketplace publish flow).
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        issue_key = (request.query_params.get('issue_key') or '').strip().upper()
        if not issue_key:
            return Response(
                {'detail': 'issue_key query param required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find any claimed Jira connection — that account scopes the result.
        # In dev (no claim yet), return all matching entries across the
        # workspace so the panel shows something useful.
        conn = JiraConnection.objects.filter(account__isnull=False).first()
        qs = TimeEntry.objects.filter(jira_issue_key=issue_key)
        if conn is not None:
            qs = qs.filter(account_id=conn.account_id)

        entries = qs.select_related(
            'user', 'project__client', 'project_task__task',
        ).order_by('-date', '-created_at')[:50]

        return Response(TimeEntrySerializer(entries, many=True).data)


class JiraStartView(APIView):
    """POST /api/integrations/jira/start/

    Body: { issue_key, project_id, project_task_id, notes?, is_billable? }

    The Forge panel must include project_id + project_task_id — v1 has no
    Jira-issue → TrackFlow-project mapping table yet, so the panel asks the
    user to pick once and persists the choice client-side.
    """

    authentication_classes = [JiraJWTAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        conn: JiraConnection | None = request.auth
        if conn is None or conn.account_id is None:
            return Response(
                {'detail': 'Jira site is not yet linked to a TrackFlow account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data or {}
        issue_key = (data.get('issue_key') or '').strip().upper()
        project_id = data.get('project_id')
        project_task_id = data.get('project_task_id')
        if not issue_key or not project_id or not project_task_id:
            return Response(
                {'detail': 'issue_key, project_id, and project_task_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            project = Project.objects.get(pk=project_id, account_id=conn.account_id)
            ptask = ProjectTask.objects.get(pk=project_task_id, project_id=project.id)
        except (Project.DoesNotExist, ProjectTask.DoesNotExist):
            return Response(
                {'detail': 'Project or task not found in this account.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # The Forge call doesn't carry a TrackFlow user identity; v1 logs
        # entries against the Jira account-user mapping, which we don't have
        # yet. Until that's wired up, require a `trackflow_user_id` on the
        # body so the panel can post it explicitly.
        tf_user_id = data.get('trackflow_user_id')
        if not tf_user_id:
            return Response(
                {'detail': 'trackflow_user_id required (Forge → TrackFlow user mapping pending).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Stop any in-flight timer for this user first.
        for existing in TimeEntry.objects.filter(user_id=tf_user_id, is_running=True):
            if existing.started_at:
                elapsed = (djtz.now() - existing.started_at).total_seconds()
                add_hours = Decimal(str(round(elapsed / 3600, 4)))
                total = (existing.hours or Decimal('0')) + add_hours
                existing.hours = min(total, Decimal('24'))
            existing.is_running = False
            existing.started_at = None
            existing.save(update_fields=['hours', 'is_running', 'started_at', 'updated_at'])

        entry = TimeEntry.objects.create(
            account_id=conn.account_id,
            user_id=tf_user_id,
            project=project,
            project_task=ptask,
            date=djtz.now().date(),
            hours=Decimal('0.00'),
            notes=(data.get('notes') or '')[:5000],
            is_billable=bool(data.get('is_billable', ptask.is_billable)),
            jira_issue_key=issue_key,
            is_running=True,
            started_at=djtz.now(),
        )
        return Response(
            TimeEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )


class JiraStopView(APIView):
    """POST /api/integrations/jira/stop/

    Body: { id }  — TrackFlow TimeEntry id to stop.
    """

    authentication_classes = [JiraJWTAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        conn: JiraConnection | None = request.auth
        if conn is None or conn.account_id is None:
            return Response(
                {'detail': 'Jira site is not linked.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entry_id = (request.data or {}).get('id')
        if not entry_id:
            return Response({'detail': 'id required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            entry = TimeEntry.objects.get(pk=entry_id, account_id=conn.account_id)
        except TimeEntry.DoesNotExist:
            return Response({'detail': 'Entry not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not entry.is_running:
            return Response(
                {'detail': 'Entry is not running.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if entry.started_at:
            elapsed = (djtz.now() - entry.started_at).total_seconds()
            add_hours = Decimal(str(round(elapsed / 3600, 4)))
            total = (entry.hours or Decimal('0')) + add_hours
            entry.hours = min(total, Decimal('24'))
        entry.is_running = False
        entry.started_at = None
        entry.save(update_fields=['hours', 'is_running', 'started_at', 'updated_at'])

        return Response(TimeEntrySerializer(entry).data)


# ---------- 3. TrackFlow user endpoints (regular JWT auth) ----------

class JiraStatusView(APIView):
    """GET /api/integrations/jira/status/ — used by Settings → Integrations.

    Reports whether *this* TrackFlow account has a JiraConnection claimed.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        conn = JiraConnection.objects.filter(account_id=request.user.account_id).first()
        if conn is None:
            return Response({
                'connected': False,
                'base_url': None,
                'connected_at': None,
            })
        return Response({
            'connected': True,
            'base_url': conn.base_url,
            'connected_at': conn.connected_at,
        })


class JiraDisconnectView(APIView):
    """DELETE /api/integrations/jira/disconnect/

    Removes the JiraConnection for the caller's account. Existing time
    entries keep their `jira_issue_key` for audit; only the credential link
    is severed.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request):
        if request.user.role not in ('owner', 'admin'):
            return Response(
                {'detail': 'Only owners or admins can disconnect Jira.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        deleted, _ = JiraConnection.objects.filter(
            account_id=request.user.account_id,
        ).delete()
        return Response({'disconnected': deleted})


class JiraClaimView(APIView):
    """POST /api/integrations/jira/claim/

    A TrackFlow admin links an unclaimed JiraConnection (just installed via
    Atlassian Marketplace) to their account. Until claimed, Forge calls
    return empty data because we don't know which workspace they belong to.

    Body: { client_key }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('owner', 'admin'):
            return Response(
                {'detail': 'Only owners or admins can link a Jira site.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        client_key = (request.data or {}).get('client_key', '').strip()
        if not client_key:
            return Response(
                {'detail': 'client_key required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            conn = JiraConnection.objects.get(client_key=client_key)
        except JiraConnection.DoesNotExist:
            return Response(
                {'detail': 'No pending Jira install matches that client_key.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if conn.account_id and conn.account_id != request.user.account_id:
            return Response(
                {'detail': 'This Jira site is already linked to another TrackFlow account.'},
                status=status.HTTP_409_CONFLICT,
            )

        conn.account_id = request.user.account_id
        conn.save(update_fields=['account', 'updated_at'])
        return Response({
            'connected': True,
            'base_url': conn.base_url,
            'connected_at': conn.connected_at,
        })


# ---------- 4. Forge auto-bootstrap (called by resolver on every invocation) ----------

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def jira_bootstrap(request):
    """POST /api/v1/integrations/jira/bootstrap/

    Mimics the Marketplace install lifecycle for unpublished Forge apps.
    The resolver calls this on every panel load with the Atlassian
    `cloud_id` (a stable per-site identifier from the Forge runtime
    context). If no JiraConnection exists for this cloud_id yet, we
    auto-create one and link it to the workspace's first owner/admin —
    instantly producing a "Connected" state in TrackFlow Settings without
    requiring the user to paste a clientKey.

    Body: { cloud_id, base_url? }
    """
    data = request.data or {}
    cloud_id = (data.get('cloud_id') or '').strip()
    base_url = (data.get('base_url') or '').strip() or 'https://unknown.atlassian.net'
    if not cloud_id:
        return Response(
            {'detail': 'cloud_id required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    conn = JiraConnection.objects.filter(client_key=cloud_id).first()
    if conn is None:
        admin = _pick_default_user()
        conn = JiraConnection.objects.create(
            client_key=cloud_id,
            base_url=base_url,
            account=admin.account if admin else None,
            default_user=admin,
            shared_secret_encrypted='',
        )
    elif conn.default_user is None or conn.account is None:
        admin = _pick_default_user()
        if admin:
            conn.default_user = admin
            conn.account = admin.account
            conn.save(update_fields=['default_user', 'account', 'updated_at'])

    return Response({
        'connected': True,
        'connection_id': conn.id,
        'account_id': conn.account_id,
        'default_user_id': conn.default_user_id,
        'default_user_name': (
            conn.default_user.full_name if conn.default_user else None
        ),
    })
