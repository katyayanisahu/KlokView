from django.urls import path

from .views import (
    MarkImportedView,
    OutlookDisconnectView,
    OutlookEventsView,
    OutlookOAuthStartView,
    OutlookStatusView,
    outlook_oauth_callback,
)

urlpatterns = [
    path('outlook/status/', OutlookStatusView.as_view(), name='outlook-status'),
    path('outlook/oauth/start/', OutlookOAuthStartView.as_view(), name='outlook-oauth-start'),
    path('outlook/oauth/callback/', outlook_oauth_callback, name='outlook-oauth-callback'),
    path('outlook/disconnect/', OutlookDisconnectView.as_view(), name='outlook-disconnect'),
    path('outlook/events/', OutlookEventsView.as_view(), name='outlook-events'),
    path('outlook/events/mark-imported/', MarkImportedView.as_view(), name='outlook-mark-imported'),
]
