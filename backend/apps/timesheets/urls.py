from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ImportBatchListView,
    ImportBatchRevertView,
    ImportTimeEntriesView,
    SubmissionViewSet,
    TimeEntryViewSet,
)

router = DefaultRouter()
router.register(r'time-entries', TimeEntryViewSet, basename='time-entry')
router.register(r'submissions', SubmissionViewSet, basename='submission')

urlpatterns = router.urls + [
    path('imports/time/', ImportTimeEntriesView.as_view(), name='imports-time'),
    path('imports/', ImportBatchListView.as_view(), name='imports-list'),
    path('imports/<int:pk>/', ImportBatchRevertView.as_view(), name='imports-revert'),
]
