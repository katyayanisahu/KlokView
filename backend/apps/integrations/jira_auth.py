"""DRF authentication for inbound calls from the TrackFlow Jira Forge App.

Two auth flavors live here:

1. `JiraJWTAuthentication` — legacy Atlassian Connect path. Verifies the
   HS256 JWT signed with the `sharedSecret` we received during the install
   lifecycle. Kept for completeness; pure Forge apps don't use this.

2. `JiraForgeAPIKeyAuthentication` — the production path for our Forge app.
   The Forge resolver attaches `Authorization: Bearer <shared-secret>` to every
   backend call; we compare it to `JIRA_FORGE_API_KEY` env var. The shared
   secret is set as an *encrypted* Forge variable (`forge variables set
   --encrypt KLOKVIEW_API_KEY ...`) so only the deployed app artifact and the
   backend know it.

See Doc 2 §13 — "Security: JWT Verification with Django".
"""
from __future__ import annotations

import hmac

import jwt
from decouple import config as env
from rest_framework import authentication, exceptions

from .models import JiraConnection


class JiraJWTAuthentication(authentication.BaseAuthentication):
    """Authenticate Forge → Django requests via Jira-issued JWT.

    The Forge runtime attaches a JWT in `Authorization: JWT <token>`. The
    token's `iss` claim is the `clientKey` from the install handshake, which
    we use to load the matching `sharedSecret` and verify the signature.

    This auth class returns `(None, jira_connection)` — there's no Django
    user behind a Forge call, so views must read `request.auth` (the
    `JiraConnection`) instead of `request.user`.
    """

    keyword = 'JWT'

    def authenticate(self, request):
        header = request.META.get('HTTP_AUTHORIZATION', '')
        if not header.startswith(f'{self.keyword} '):
            return None  # Let other auth classes have a turn.

        token = header[len(self.keyword) + 1:].strip()
        if not token:
            raise exceptions.AuthenticationFailed('Empty Jira JWT.')

        try:
            unverified = jwt.decode(token, options={'verify_signature': False})
        except jwt.PyJWTError as exc:
            raise exceptions.AuthenticationFailed(f'Malformed Jira JWT: {exc}')

        client_key = unverified.get('iss')
        if not client_key:
            raise exceptions.AuthenticationFailed('Jira JWT missing iss claim.')

        try:
            conn = JiraConnection.objects.get(client_key=client_key)
        except JiraConnection.DoesNotExist:
            raise exceptions.AuthenticationFailed('Unknown Jira client_key.')

        try:
            jwt.decode(
                token,
                conn.shared_secret,
                algorithms=['HS256'],
                # Atlassian JWTs include 'qsh' (query-string-hash); we don't
                # need to verify it for the v1 endpoints since each Forge
                # call posts JSON to a fixed path. Skip aud verification too.
                options={'verify_aud': False, 'verify_iss': False},
            )
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Jira JWT expired.')
        except jwt.InvalidSignatureError:
            raise exceptions.AuthenticationFailed('Jira JWT signature invalid.')
        except jwt.PyJWTError as exc:
            raise exceptions.AuthenticationFailed(f'Jira JWT rejected: {exc}')

        return (None, conn)

    def authenticate_header(self, request):
        return self.keyword


class JiraForgeAPIKeyAuthentication(authentication.BaseAuthentication):
    """Authenticate Forge → Django requests via shared Bearer token.

    The Forge app reads `KLOKVIEW_API_KEY` (encrypted Forge variable) and sends
    it as `Authorization: Bearer <key>`. We compare it constant-time against
    `JIRA_FORGE_API_KEY` (Django env). When the env var is empty we *fall open*
    — i.e. accept the request without requiring auth — so local dev with
    `forge tunnel` (no Forge variable set) keeps working. In production set the
    env var and the auth is enforced.

    On success we don't bind a Django user (Forge calls aren't user-scoped at
    this layer — `_resolve_effective_user` does that later via `jira_email`).
    We just return `(None, None)` to let DRF proceed.
    """

    keyword = 'Bearer'

    def authenticate(self, request):
        expected = env('JIRA_FORGE_API_KEY', default='', cast=str).strip()
        header = request.META.get('HTTP_AUTHORIZATION', '')

        if not expected:
            # Dev mode — auth not configured on this backend, let request through.
            # Marketplace-distributed prod must set JIRA_FORGE_API_KEY.
            return None

        if not header.startswith(f'{self.keyword} '):
            raise exceptions.AuthenticationFailed(
                'Missing Authorization: Bearer header from Forge app.'
            )

        provided = header[len(self.keyword) + 1:].strip()
        if not provided or not hmac.compare_digest(provided, expected):
            raise exceptions.AuthenticationFailed('Invalid Forge API key.')

        return (None, None)

    def authenticate_header(self, request):
        return self.keyword
