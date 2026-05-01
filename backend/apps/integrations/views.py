from datetime import datetime, time, timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.http import HttpResponseRedirect
from django.shortcuts import redirect
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import outlook as ms
from .models import ImportedCalendarEvent, OutlookConnection
from .serializers import (
    MarkImportedSerializer,
    OutlookEventSerializer,
    OutlookStatusSerializer,
)


def _frontend_url(path: str) -> str:
    base = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
    return f'{base}{path}'


class OutlookStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            conn = request.user.outlook_connection
            data = {
                'connected': True,
                'email': conn.ms_account_email,
                'connected_at': conn.connected_at,
                'configured': ms.is_configured(),
            }
        except OutlookConnection.DoesNotExist:
            data = {
                'connected': False,
                'email': None,
                'connected_at': None,
                'configured': ms.is_configured(),
            }
        return Response(OutlookStatusSerializer(data).data)


class OutlookOAuthStartView(APIView):
    """Returns the MS authorize URL. Frontend redirects the browser to it.

    The state token is signed with the user's auth token + a random nonce so
    the callback can identify which user came back, since MS will hit the
    callback as an unauthenticated browser redirect.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not ms.is_configured():
            return Response(
                {'detail': 'Outlook integration is not configured on the server. Set MS_CLIENT_ID/MS_CLIENT_SECRET.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        from django.core.signing import TimestampSigner

        nonce = ms.make_state()
        signer = TimestampSigner(salt='outlook-oauth')
        state = signer.sign(f'{request.user.id}:{nonce}')
        url = ms.build_authorize_url(state)
        return Response({'authorize_url': url})


@api_view(['GET'])
@permission_classes([AllowAny])
def outlook_oauth_callback(request):
    """Browser redirect target after MS consent. Validates state, exchanges
    code for tokens, saves the connection, then bounces back to the frontend.
    """
    from django.contrib.auth import get_user_model
    from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

    error = request.GET.get('error')
    if error:
        return HttpResponseRedirect(_frontend_url(f'/time?outlook=error&reason={error}'))

    code = request.GET.get('code')
    state = request.GET.get('state')
    if not code or not state:
        return HttpResponseRedirect(_frontend_url('/time?outlook=error&reason=missing_code'))

    signer = TimestampSigner(salt='outlook-oauth')
    try:
        payload = signer.unsign(state, max_age=600)  # 10 minutes
        user_id_str, _nonce = payload.split(':', 1)
        user_id = int(user_id_str)
    except (BadSignature, SignatureExpired, ValueError):
        return HttpResponseRedirect(_frontend_url('/time?outlook=error&reason=bad_state'))

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return HttpResponseRedirect(_frontend_url('/time?outlook=error&reason=no_user'))

    try:
        token_response = ms.exchange_code_for_tokens(code)
    except requests.HTTPError as exc:
        body = ''
        try:
            body = exc.response.text[:200] if exc.response is not None else ''
        except Exception:
            body = ''
        return HttpResponseRedirect(_frontend_url(f'/time?outlook=error&reason=token_exchange&detail={body[:80]}'))

    try:
        ms.save_tokens_for_user(user, token_response)
    except requests.HTTPError:
        return HttpResponseRedirect(_frontend_url('/time?outlook=error&reason=profile_lookup'))

    return HttpResponseRedirect(_frontend_url('/time?outlook=connected'))


class OutlookDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        OutlookConnection.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OutlookEventsView(APIView):
    """List calendar events for a given date (YYYY-MM-DD; defaults to today),
    annotated with already_imported so the picker can gray them out.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            conn = request.user.outlook_connection
        except OutlookConnection.DoesNotExist:
            return Response(
                {'detail': 'Outlook is not connected for this user.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        date_str = request.query_params.get('date')
        if date_str:
            try:
                day = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'detail': 'Invalid date; expected YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            day = timezone.localdate()

        # Day window in UTC. Graph treats startDateTime/endDateTime as inclusive/exclusive.
        start_dt = datetime.combine(day, time.min)
        end_dt = start_dt + timedelta(days=1)
        start_iso = start_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_iso = end_dt.strftime('%Y-%m-%dT%H:%M:%SZ')

        try:
            raw_events = ms.list_calendar_events(conn, start_iso, end_iso)
        except requests.HTTPError as exc:
            detail = 'Outlook request failed.'
            if exc.response is not None and exc.response.status_code == 401:
                detail = 'Outlook session expired. Please reconnect.'
            return Response({'detail': detail}, status=status.HTTP_502_BAD_GATEWAY)
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        already = set(
            ImportedCalendarEvent.objects
            .filter(user=request.user, outlook_event_id__in=[e['id'] for e in raw_events])
            .values_list('outlook_event_id', flat=True)
        )

        out = []
        for ev in raw_events:
            if ev.get('isCancelled'):
                continue
            start = ev.get('start', {}).get('dateTime')
            end = ev.get('end', {}).get('dateTime')
            if not start or not end:
                continue
            try:
                start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
            except ValueError:
                continue
            duration_hours = max(0.0, (end_dt - start_dt).total_seconds() / 3600.0)
            organizer = (ev.get('organizer') or {}).get('emailAddress', {}).get('name', '') or ''
            out.append({
                'outlook_event_id': ev['id'],
                'subject': ev.get('subject') or '(no subject)',
                'start': start_dt,
                'end': end_dt,
                'duration_hours': round(duration_hours, 2),
                'body_preview': ev.get('bodyPreview', '') or '',
                'organizer': organizer,
                'web_link': ev.get('webLink', '') or '',
                'already_imported': ev['id'] in already,
            })

        return Response(OutlookEventSerializer(out, many=True).data)


class MarkImportedView(APIView):
    """Record that an Outlook event has been pulled into TrackFlow as a
    given TimeEntry. Idempotent — calling twice with the same outlook_event_id
    just updates the linked entry.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.timesheets.models import TimeEntry

        outlook_event_id = request.data.get('outlook_event_id')
        time_entry_id = request.data.get('time_entry_id')
        subject = request.data.get('subject', '') or ''
        event_start = request.data.get('event_start')
        event_end = request.data.get('event_end')

        if not outlook_event_id:
            return Response({'detail': 'outlook_event_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        time_entry = None
        if time_entry_id:
            try:
                time_entry = TimeEntry.objects.get(pk=time_entry_id, user=request.user)
            except TimeEntry.DoesNotExist:
                return Response({'detail': 'time_entry not found.'}, status=status.HTTP_404_NOT_FOUND)

        record, _created = ImportedCalendarEvent.objects.update_or_create(
            user=request.user,
            outlook_event_id=outlook_event_id,
            defaults={
                'time_entry': time_entry,
                'event_subject': subject,
                'event_start': event_start,
                'event_end': event_end,
            },
        )
        return Response(MarkImportedSerializer(record).data, status=status.HTTP_201_CREATED)
