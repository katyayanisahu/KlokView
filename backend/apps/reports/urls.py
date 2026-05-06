from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import (
    ActivityLogReportView,
    ProfitabilityReportView,
    SavedReportViewSet,
    TimeReportView,
)

router = SimpleRouter()
router.register(r'saved', SavedReportViewSet, basename='saved-reports')

urlpatterns = [
    path('time/', TimeReportView.as_view(), name='reports-time'),
    path('profitability/', ProfitabilityReportView.as_view(), name='reports-profitability'),
    path('activity/', ActivityLogReportView.as_view(), name='reports-activity'),
    path('', include(router.urls)),
]
