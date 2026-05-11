"""Microsoft Azure AD sign-in (SSO) helpers.

Separate from `apps/integrations/outlook.py` — this module exists purely to
authenticate users into TrackFlow (issues a JWT), not to access Graph
resources. Uses the same `MS_CLIENT_ID`/`MS_CLIENT_SECRET` Azure AD app
registration but a distinct redirect URI (`MS_SSO_REDIRECT_URI`).

Single-workspace match: the Microsoft email is looked up against `User.email`
exactly (case-insensitive). If no active user matches, the SSO flow rejects.
The user must be invited into a workspace first (no auto-provisioning).
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

# SSO needs only identity scopes — no Calendars/offline_access.
SCOPES = ['openid', 'profile', 'email', 'User.Read']
GRAPH_ME = 'https://graph.microsoft.com/v1.0/me'
STATE_SALT = 'microsoft-sso-state'
STATE_MAX_AGE_SECONDS = 600  # 10 minutes


def _tenant() -> str:
    return getattr(settings, 'MS_TENANT', 'common') or 'common'


def _client_id() -> str:
    return getattr(settings, 'MS_CLIENT_ID', '')


def _client_secret() -> str:
    return getattr(settings, 'MS_CLIENT_SECRET', '')


def _redirect_uri() -> str:
    return getattr(
        settings,
        'MS_SSO_REDIRECT_URI',
        'http://localhost:8000/api/v1/auth/microsoft/callback/',
    )


def is_configured() -> bool:
    return bool(_client_id() and _client_secret())


def make_state(return_path: str = '/dashboard') -> str:
    """Generate a signed state value embedding the post-login redirect path."""
    signer = TimestampSigner(salt=STATE_SALT)
    return signer.sign(return_path)


def verify_state(state: str) -> str:
    """Return the embedded return_path, or raise ValueError if invalid/expired."""
    signer = TimestampSigner(salt=STATE_SALT)
    try:
        return signer.unsign(state, max_age=STATE_MAX_AGE_SECONDS)
    except SignatureExpired as exc:
        raise ValueError('State token has expired. Please retry sign-in.') from exc
    except BadSignature as exc:
        raise ValueError('Invalid state token.') from exc


def build_authorize_url(state: str) -> str:
    params = {
        'client_id': _client_id(),
        'response_type': 'code',
        'redirect_uri': _redirect_uri(),
        'response_mode': 'query',
        'scope': ' '.join(SCOPES),
        'state': state,
        'prompt': 'select_account',
    }
    base = f'https://login.microsoftonline.com/{_tenant()}/oauth2/v2.0/authorize'
    return f'{base}?{urlencode(params)}'


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    url = f'https://login.microsoftonline.com/{_tenant()}/oauth2/v2.0/token'
    data = {
        'client_id': _client_id(),
        'client_secret': _client_secret(),
        'code': code,
        'redirect_uri': _redirect_uri(),
        'grant_type': 'authorization_code',
        'scope': ' '.join(SCOPES),
    }
    resp = requests.post(url, data=data, timeout=15)
    resp.raise_for_status()
    return resp.json()


def fetch_user_email(access_token: str) -> str:
    """Return the email for the access token's user. Falls back to UPN if mail is None."""
    resp = requests.get(
        GRAPH_ME,
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return (data.get('mail') or data.get('userPrincipalName') or '').strip().lower()
