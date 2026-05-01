"""Microsoft OAuth + Graph helpers — pure-`requests`, no MSAL dependency.

OAuth 2.0 authorization code flow against the v2 endpoint. Requires an Azure
AD app registration with these env vars set in backend/.env:

    MS_CLIENT_ID=...
    MS_CLIENT_SECRET=...
    MS_REDIRECT_URI=http://localhost:8000/api/v1/integrations/outlook/oauth/callback/
    MS_TENANT=common   # or 'consumers' for personal MSAs only

Scopes used: offline_access, openid, email, User.Read, Calendars.Read.
"""
from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.utils import timezone

from .models import OutlookConnection

GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
SCOPES = ['offline_access', 'openid', 'email', 'User.Read', 'Calendars.Read']


def _tenant() -> str:
    return getattr(settings, 'MS_TENANT', 'common') or 'common'


def _client_id() -> str:
    return getattr(settings, 'MS_CLIENT_ID', '')


def _client_secret() -> str:
    return getattr(settings, 'MS_CLIENT_SECRET', '')


def _redirect_uri() -> str:
    return getattr(
        settings,
        'MS_REDIRECT_URI',
        'http://localhost:8000/api/v1/integrations/outlook/oauth/callback/',
    )


def is_configured() -> bool:
    return bool(_client_id() and _client_secret())


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


def make_state() -> str:
    return secrets.token_urlsafe(32)


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


def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    url = f'https://login.microsoftonline.com/{_tenant()}/oauth2/v2.0/token'
    data = {
        'client_id': _client_id(),
        'client_secret': _client_secret(),
        'refresh_token': refresh_token,
        'grant_type': 'refresh_token',
        'scope': ' '.join(SCOPES),
    }
    resp = requests.post(url, data=data, timeout=15)
    resp.raise_for_status()
    return resp.json()


def fetch_user_email(access_token: str) -> str:
    resp = requests.get(
        f'{GRAPH_BASE}/me',
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get('mail') or data.get('userPrincipalName') or ''


def save_tokens_for_user(user, token_response: dict[str, Any]) -> OutlookConnection:
    access = token_response.get('access_token', '')
    refresh = token_response.get('refresh_token', '')
    expires_in = int(token_response.get('expires_in', 3600))
    scope = token_response.get('scope', '')

    email = fetch_user_email(access) or ''

    conn, _ = OutlookConnection.objects.get_or_create(
        user=user,
        defaults={
            'ms_account_email': email,
            'access_token_encrypted': '',
            'refresh_token_encrypted': '',
            'token_expires_at': timezone.now() + timedelta(seconds=expires_in),
        },
    )
    conn.ms_account_email = email or conn.ms_account_email
    conn.access_token = access
    if refresh:  # MS may omit refresh_token on subsequent refreshes
        conn.refresh_token = refresh
    conn.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
    conn.scope = scope
    conn.save()
    return conn


def ensure_fresh_token(conn: OutlookConnection) -> str:
    """Return a usable access token, refreshing if expired or about to expire."""
    if conn.token_expires_at and conn.token_expires_at - timezone.now() > timedelta(minutes=2):
        return conn.access_token
    refresh = conn.refresh_token
    if not refresh:
        raise RuntimeError('No refresh token available; user must reconnect.')
    payload = refresh_access_token(refresh)
    conn.access_token = payload.get('access_token', '')
    if payload.get('refresh_token'):
        conn.refresh_token = payload['refresh_token']
    conn.token_expires_at = timezone.now() + timedelta(
        seconds=int(payload.get('expires_in', 3600)),
    )
    conn.save(update_fields=[
        'access_token_encrypted', 'refresh_token_encrypted', 'token_expires_at', 'updated_at',
    ])
    return conn.access_token


def list_calendar_events(conn: OutlookConnection, start_iso: str, end_iso: str) -> list[dict[str, Any]]:
    """Return raw Graph calendarView entries between two ISO datetimes (UTC)."""
    token = ensure_fresh_token(conn)
    params = {
        'startDateTime': start_iso,
        'endDateTime': end_iso,
        '$select': 'id,subject,start,end,bodyPreview,isCancelled,showAs,organizer,webLink',
        '$orderby': 'start/dateTime',
        '$top': 100,
    }
    resp = requests.get(
        f'{GRAPH_BASE}/me/calendarView',
        headers={
            'Authorization': f'Bearer {token}',
            'Prefer': 'outlook.timezone="UTC"',
        },
        params=params,
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json().get('value', []) or []
