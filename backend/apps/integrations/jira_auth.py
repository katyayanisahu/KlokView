"""DRF authentication for inbound calls from the TrackFlow Jira Forge App.

Atlassian Connect / Forge sends a JWT signed with the `sharedSecret` we
received during the install lifecycle. We verify the signature, look up the
matching `JiraConnection`, and stash it on `request.auth` so views can read
the calling Jira site's identity without re-querying.

See Doc 2 §13 — "Security: JWT Verification with Django".
"""
from __future__ import annotations

import jwt
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
