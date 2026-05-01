from rest_framework.routers import DefaultRouter

from .views import SubmissionViewSet, TimeEntryViewSet

router = DefaultRouter()
router.register(r'time-entries', TimeEntryViewSet, basename='time-entry')
router.register(r'submissions', SubmissionViewSet, basename='submission')

urlpatterns = router.urls
