"""Root URL configuration for trackflow."""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.accounts.urls')),
    path('api/v1/clients/', include('apps.clients.urls')),
    path('api/v1/', include('apps.projects.urls')),
    path('api/v1/', include('apps.timesheets.urls')),
    path('api/v1/integrations/', include('apps.integrations.urls')),
    # Placeholders for later phases:
    # path('api/v1/reports/', include('apps.reports.urls')),
    # path('api/v1/invoices/', include('apps.invoices.urls')),
]
