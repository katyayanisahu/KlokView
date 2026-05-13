from django.urls import path

from .jira_views import (
    JiraClaimView,
    JiraDisconnectView,
    JiraEntriesView,
    JiraProjectsView,
    JiraStartView,
    JiraStatusView,
    JiraStopView,
    jira_bootstrap,
    jira_installed,
    jira_uninstalled,
)
from .views import (
    MarkImportedView,
    OutlookDisconnectView,
    OutlookEventsView,
    OutlookOAuthStartView,
    OutlookStatusView,
    outlook_oauth_callback,
)

urlpatterns = [
    # Outlook (Epic 8)
    path('outlook/status/', OutlookStatusView.as_view(), name='outlook-status'),
    path('outlook/oauth/start/', OutlookOAuthStartView.as_view(), name='outlook-oauth-start'),
    path('outlook/oauth/callback/', outlook_oauth_callback, name='outlook-oauth-callback'),
    path('outlook/disconnect/', OutlookDisconnectView.as_view(), name='outlook-disconnect'),
    path('outlook/events/', OutlookEventsView.as_view(), name='outlook-events'),
    path('outlook/events/mark-imported/', MarkImportedView.as_view(), name='outlook-mark-imported'),

    # Jira Forge App (Epic 7)
    # Atlassian install lifecycle (unauthenticated — secret arrives in payload)
    path('jira/installed/', jira_installed, name='jira-installed'),
    path('jira/uninstalled/', jira_uninstalled, name='jira-uninstalled'),
    # Forge panel → Django (Jira-signed JWT auth in prod, cloud_id in dev)
    path('jira/entries/', JiraEntriesView.as_view(), name='jira-entries'),
    path('jira/projects/', JiraProjectsView.as_view(), name='jira-projects'),
    path('jira/start/', JiraStartView.as_view(), name='jira-start'),
    path('jira/stop/', JiraStopView.as_view(), name='jira-stop'),
    # Forge auto-bootstrap — replicates Marketplace install lifecycle
    path('jira/bootstrap/', jira_bootstrap, name='jira-bootstrap'),
    # TrackFlow user → Django (regular JWT user auth)
    path('jira/status/', JiraStatusView.as_view(), name='jira-status'),
    path('jira/disconnect/', JiraDisconnectView.as_view(), name='jira-disconnect'),
    path('jira/claim/', JiraClaimView.as_view(), name='jira-claim'),
]
