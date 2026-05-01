from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    InviteAcceptView,
    InviteAssignProjectsView,
    InviteCreateView,
    InviteResendView,
    InviteUpdateView,
    InviteValidateView,
    JobRoleViewSet,
    LoginView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
    RegisterView,
    UserDeleteView,
    UserDetailView,
    UserListView,
)

router = DefaultRouter()
router.register(r'job-roles', JobRoleViewSet, basename='job-role')

urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('token/refresh/', RefreshView.as_view(), name='auth-refresh'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('users/', UserListView.as_view(), name='auth-users'),
    path('users/<int:pk>/', UserDetailView.as_view(), name='auth-user-detail'),
    path('users/<int:pk>/delete/', UserDeleteView.as_view(), name='auth-user-delete'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='auth-password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
    path('invites/', InviteCreateView.as_view(), name='auth-invite-create'),
    path('invites/validate/', InviteValidateView.as_view(), name='auth-invite-validate'),
    path('invites/accept/', InviteAcceptView.as_view(), name='auth-invite-accept'),
    path('invites/<int:pk>/resend/', InviteResendView.as_view(), name='auth-invite-resend'),
    path('invites/<int:pk>/', InviteUpdateView.as_view(), name='auth-invite-update'),
    path(
        'invites/<int:pk>/assign-projects/',
        InviteAssignProjectsView.as_view(),
        name='auth-invite-assign-projects',
    ),
    path('', include(router.urls)),
]
