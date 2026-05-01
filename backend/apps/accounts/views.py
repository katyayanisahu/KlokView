import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import models, transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .models import Account, JobRole
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenRefreshView

from .permissions import IsOwnerOrAdmin, IsOwnerOrAdminForWrite
from .tenant import TenantScopedMixin
from .serializers import (
    InviteAcceptSerializer,
    InviteAssignProjectsSerializer,
    InviteCreateSerializer,
    InviteUpdateSerializer,
    InviteUserSerializer,
    JobRoleSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    TeamMemberDetailSerializer,
    TeamMemberSerializer,
    UserSerializer,
    tokens_for_user,
)

User = get_user_model()
INVITE_EXPIRY_DAYS = 7


def envelope(data=None, success: bool = True, error=None, status_code: int = status.HTTP_200_OK):
    return Response(
        {'success': success, 'data': data, 'error': error},
        status=status_code,
    )


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        account_name = (data.get('company_name') or data['full_name']).strip() or 'Workspace'

        with transaction.atomic():
            account = Account.objects.create(name=account_name)
            user = User.objects.create_user(
                email=data['email'],
                full_name=data['full_name'],
                password=data['password'],
                account=account,
                role=User.Role.OWNER,
            )
            account.owner = user
            account.save(update_fields=['owner', 'updated_at'])

        tokens = tokens_for_user(user)
        return envelope(
            data={'user': UserSerializer(user).data, **tokens},
            status_code=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return envelope(data=serializer.validated_data)


class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        return envelope(data=response.data, status_code=response.status_code)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        reset_url = None
        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"
            display_name = user.full_name or user.email
            subject = 'Reset your TrackFlow password'
            body = (
                f"Hi {display_name},\n\n"
                f"We received a request to reset the password for your TrackFlow account.\n\n"
                f"Use the link below to choose a new password. The link will expire in 3 days.\n\n"
                f"{reset_url}\n\n"
                f"If you didn't request this, you can safely ignore this email.\n\n"
                f"— The TrackFlow team"
            )
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=not settings.DEBUG,
            )

        data = {'detail': 'If an account exists for that email, a reset link has been sent.'}
        if settings.DEBUG and reset_url:
            data['reset_url'] = reset_url

        return envelope(data=data)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return envelope(data={'detail': 'Password has been reset.'})


def _send_invite_email(invited_user, inviter_name: str, invite_url: str) -> None:
    subject = "You've been invited to join TrackFlow"
    display_name = invited_user.first_name or invited_user.full_name or invited_user.email
    body = (
        f"Hi {display_name},\n\n"
        f"{inviter_name} has invited you to join TrackFlow.\n\n"
        f"Click the link below to set your password and get started. The link will expire in {INVITE_EXPIRY_DAYS} days.\n\n"
        f"{invite_url}\n\n"
        f"If you weren't expecting this invite, you can safely ignore this email.\n\n"
        f"— The TrackFlow team"
    )
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invited_user.email],
        fail_silently=not settings.DEBUG,
    )


def _generate_invite_token() -> str:
    return secrets.token_urlsafe(48)[:64]


def _build_invite_url(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/accept-invite?token={token}"


class InviteCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def post(self, request):
        serializer = InviteCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        first_name = data['first_name'].strip()
        last_name = data['last_name'].strip()
        full_name = f"{first_name} {last_name}".strip()

        invited_user = User(
            email=data['email'],
            first_name=first_name,
            last_name=last_name,
            full_name=full_name,
            role=data.get('role', 'member'),
            employee_id=data.get('employee_id', '') or '',
            weekly_capacity_hours=data.get('weekly_capacity_hours', 35),
            is_active=False,
            invitation_token=_generate_invite_token(),
            invited_at=timezone.now(),
            invited_by=request.user,
            account=request.user.account,
        )
        invited_user.set_unusable_password()
        invited_user.save()

        job_roles = data.get('job_role_ids') or []
        if job_roles:
            invited_user.job_roles.set(job_roles)

        invite_url = _build_invite_url(invited_user.invitation_token)
        inviter_name = request.user.full_name or request.user.email
        _send_invite_email(invited_user, inviter_name, invite_url)

        response_data = InviteUserSerializer(invited_user).data
        if settings.DEBUG:
            response_data['invite_url'] = invite_url
        return envelope(data=response_data, status_code=status.HTTP_201_CREATED)


class InviteUpdateView(APIView):
    """Update a team member: name, email, role, employee_id, capacity, job roles, archive."""
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def patch(self, request, pk):
        target = User.objects.filter(pk=pk, account_id=request.user.account_id).first()
        if target is None:
            return envelope(
                success=False, error='User not found.',
                status_code=status.HTTP_404_NOT_FOUND,
            )

        if target.role == 'owner' and target.id != request.user.id:
            return envelope(
                success=False, error='You cannot modify the workspace owner.',
                status_code=status.HTTP_403_FORBIDDEN,
            )

        serializer = InviteUpdateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        update_fields = ['updated_at']
        if 'first_name' in data:
            target.first_name = (data['first_name'] or '').strip()
            update_fields.append('first_name')
        if 'last_name' in data:
            target.last_name = (data['last_name'] or '').strip()
            update_fields.append('last_name')
        if 'first_name' in data or 'last_name' in data:
            target.full_name = f"{target.first_name} {target.last_name}".strip()
            update_fields.append('full_name')
        if 'email' in data:
            new_email = data['email'].strip().lower()
            conflict = User.objects.filter(email__iexact=new_email).exclude(pk=target.pk).exists()
            if conflict:
                return envelope(
                    success=False, error='Another user already has this email.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            target.email = new_email
            update_fields.append('email')
        if 'role' in data:
            target.role = data['role']
            update_fields.append('role')
        if 'employee_id' in data:
            target.employee_id = data['employee_id'] or ''
            update_fields.append('employee_id')
        if 'weekly_capacity_hours' in data:
            target.weekly_capacity_hours = data['weekly_capacity_hours']
            update_fields.append('weekly_capacity_hours')
        if 'is_active' in data:
            target.is_active = data['is_active']
            update_fields.append('is_active')
        target.save(update_fields=update_fields)

        if 'job_role_ids' in data:
            target.job_roles.set(data['job_role_ids'])

        return envelope(data=TeamMemberDetailSerializer(target).data)


class UserDetailView(APIView):
    """GET single user with full detail (for the Team edit page)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        target = User.objects.filter(pk=pk, account_id=request.user.account_id).first()
        if target is None:
            return envelope(
                success=False, error='User not found.',
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return envelope(data=TeamMemberDetailSerializer(target).data)


class UserDeleteView(APIView):
    """Hard-delete a team member. Owner only. Cannot delete the owner themselves."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if request.user.role != 'owner':
            return envelope(
                success=False, error='Only the workspace owner can delete users.',
                status_code=status.HTTP_403_FORBIDDEN,
            )
        target = User.objects.filter(pk=pk, account_id=request.user.account_id).first()
        if target is None:
            return envelope(
                success=False, error='User not found.',
                status_code=status.HTTP_404_NOT_FOUND,
            )
        if target.role == 'owner':
            return envelope(
                success=False, error='You cannot delete the workspace owner.',
                status_code=status.HTTP_403_FORBIDDEN,
            )
        if target.id == request.user.id:
            return envelope(
                success=False, error='You cannot delete your own account from here.',
                status_code=status.HTTP_403_FORBIDDEN,
            )
        target.delete()
        return envelope(data={'detail': 'User deleted.'})


class InviteAssignProjectsView(APIView):
    """Bulk-assign a user to projects with optional manager flag per project."""
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def post(self, request, pk):
        from apps.projects.models import Project, ProjectMembership

        target = User.objects.filter(pk=pk, account_id=request.user.account_id).first()
        if target is None:
            return envelope(
                success=False, error='User not found.',
                status_code=status.HTTP_404_NOT_FOUND,
            )

        serializer = InviteAssignProjectsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        project_ids = set(data.get('project_ids') or [])
        manager_ids = set(data.get('manages_project_ids') or [])

        valid_projects = list(
            Project.objects.filter(
                pk__in=project_ids, account_id=request.user.account_id,
            )
        )
        valid_ids = {p.id for p in valid_projects}

        with transaction.atomic():
            for project in valid_projects:
                ProjectMembership.objects.update_or_create(
                    project=project, user=target,
                    defaults={'is_project_manager': project.id in manager_ids},
                )
            ProjectMembership.objects.filter(
                user=target, project__account_id=request.user.account_id,
            ).exclude(project_id__in=valid_ids).delete()

        return envelope(data={
            'assigned_count': len(valid_ids),
            'manager_count': len(valid_ids & manager_ids),
        })


class InviteValidateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get('token', '').strip()
        if not token:
            return envelope(data={'isValid': False, 'reason': 'not_found'})

        user = User.objects.filter(invitation_token=token).first()
        if user is None:
            return envelope(data={'isValid': False, 'reason': 'not_found'})

        if user.is_active:
            return envelope(data={'isValid': False, 'reason': 'already_used'})

        if user.invited_at is None or timezone.now() - user.invited_at > timedelta(days=INVITE_EXPIRY_DAYS):
            return envelope(data={'isValid': False, 'reason': 'expired'})

        return envelope(
            data={
                'isValid': True,
                'firstName': user.first_name,
                'lastName': user.last_name,
                'email': user.email,
                'accountName': 'TrackFlow',
            }
        )


class InviteAcceptView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = InviteAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data['token'].strip()

        user = User.objects.filter(invitation_token=token).first()
        if user is None:
            return envelope(
                success=False,
                error='This invite link is invalid.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if user.is_active:
            return envelope(
                success=False,
                error='This invite has already been used. Please log in instead.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if user.invited_at is None or timezone.now() - user.invited_at > timedelta(days=INVITE_EXPIRY_DAYS):
            return envelope(
                success=False,
                error='This invite link has expired. Ask your admin to resend it.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['password'])
        user.is_active = True
        user.save(update_fields=['password', 'is_active', 'updated_at'])

        tokens = tokens_for_user(user)
        return envelope(data={'user': UserSerializer(user).data, **tokens})


class InviteResendView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def post(self, request, pk):
        user = User.objects.filter(pk=pk, is_active=False).first()
        if user is None:
            return envelope(
                success=False,
                error='No pending invite found for this user.',
                status_code=status.HTTP_404_NOT_FOUND,
            )

        user.invitation_token = _generate_invite_token()
        user.invited_at = timezone.now()
        user.save(update_fields=['invitation_token', 'invited_at', 'updated_at'])

        invite_url = _build_invite_url(user.invitation_token)
        inviter_name = request.user.full_name or request.user.email
        _send_invite_email(user, inviter_name, invite_url)

        response_data = {'detail': f'Invite resent to {user.email}.'}
        if settings.DEBUG:
            response_data['invite_url'] = invite_url
        return envelope(data=response_data)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return envelope(data=UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return envelope(data=serializer.data)


class UserListView(APIView):
    """List users in the current account.

    Default: active users only (used by member pickers).
    `?include_pending=1` includes invited-but-not-accepted users.
    `?include_archived=1` includes archived (is_active=False, no invitation_token) users.
    `?detail=team` returns the richer TeamMemberSerializer payload.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        include_pending = request.query_params.get('include_pending') in ('1', 'true', 'yes')
        include_archived = request.query_params.get('include_archived') in ('1', 'true', 'yes')
        detail = request.query_params.get('detail')

        qs = User.objects.filter(account_id=request.user.account_id)
        if not include_pending and not include_archived:
            qs = qs.filter(is_active=True)
        elif include_pending and not include_archived:
            # active OR pending-invite
            qs = qs.filter(models.Q(is_active=True) | ~models.Q(invitation_token=''))
        # else: include everyone (active + pending + archived)
        qs = qs.order_by('-is_active', 'full_name')

        if detail == 'team':
            return Response(TeamMemberSerializer(qs, many=True).data)
        return Response(UserSerializer(qs, many=True).data)


class JobRoleViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """Workspace-scoped CRUD for organizational role labels."""
    queryset = JobRole.objects.all()
    serializer_class = JobRoleSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrite]
