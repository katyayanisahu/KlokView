from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.db.models import Sum
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import JobRole

User = get_user_model()


def _user_hours_this_week(user, *, billable_only: bool = False) -> Decimal:
    """Sum a user's TimeEntry hours for the current Mon–Sun week."""
    today = date.today()
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=6)
    qs = user.time_entries.filter(date__gte=start, date__lte=end)
    if billable_only:
        qs = qs.filter(is_billable=True)
    total = qs.aggregate(total=Sum('hours'))['total']
    return total if total is not None else Decimal('0')


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'full_name', 'role', 'avatar_url', 'hourly_rate')
        read_only_fields = ('id', 'role')


class JobRoleAssignedUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'full_name', 'email', 'avatar_url')


class JobRoleSerializer(serializers.ModelSerializer):
    people_count = serializers.IntegerField(source='users.count', read_only=True)
    assigned_users = JobRoleAssignedUserSerializer(source='users', many=True, read_only=True)
    assigned_user_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), source='users',
        required=False, write_only=True,
    )

    class Meta:
        model = JobRole
        fields = (
            'id', 'name', 'people_count',
            'assigned_users', 'assigned_user_ids',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'people_count', 'assigned_users', 'created_at', 'updated_at')

    def validate_assigned_user_ids(self, value):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            account_id = request.user.account_id
            for u in value:
                if u.account_id != account_id:
                    raise serializers.ValidationError(
                        'Cannot assign a user from a different account.'
                    )
        return value


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    company_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value.lower()


class LoginSerializer(TokenObtainPairSerializer):
    username_field = User.USERNAME_FIELD

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        token['role'] = user.role
        token['account_id'] = user.account_id
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class InviteCreateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=75)
    last_name = serializers.CharField(max_length=75)
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=[('admin', 'Admin'), ('manager', 'Manager'), ('member', 'Member')],
        required=False,
        default='member',
    )
    employee_id = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    weekly_capacity_hours = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=35,
    )
    job_role_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=JobRole.objects.all(), required=False, default=list,
    )

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('This email is already in your account.')
        return email

    def validate_job_role_ids(self, value):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            account_id = request.user.account_id
            for jr in value:
                if jr.account_id != account_id:
                    raise serializers.ValidationError(
                        'Cannot assign a job role from a different account.'
                    )
        return value


class InviteUpdateSerializer(serializers.Serializer):
    """Patch a team member — set permission level, profile fields, or archive flag."""

    first_name = serializers.CharField(max_length=75, required=False)
    last_name = serializers.CharField(max_length=75, required=False)
    email = serializers.EmailField(required=False)
    role = serializers.ChoiceField(
        choices=[('admin', 'Admin'), ('manager', 'Manager'), ('member', 'Member')],
        required=False,
    )
    employee_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    weekly_capacity_hours = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False,
    )
    job_role_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=JobRole.objects.all(), required=False,
    )
    is_active = serializers.BooleanField(required=False)

    def validate_job_role_ids(self, value):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            account_id = request.user.account_id
            for jr in value:
                if jr.account_id != account_id:
                    raise serializers.ValidationError(
                        'Cannot assign a job role from a different account.'
                    )
        return value


class InviteAssignProjectsSerializer(serializers.Serializer):
    project_ids = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=True, default=list,
    )
    manages_project_ids = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=True, default=list,
    )


class InviteAcceptSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return attrs


class InviteUserSerializer(serializers.ModelSerializer):
    job_role_ids = serializers.PrimaryKeyRelatedField(
        source='job_roles', many=True, read_only=True,
    )
    job_role_names = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'email', 'first_name', 'last_name', 'full_name', 'role',
            'invited_at', 'is_active',
            'employee_id', 'weekly_capacity_hours',
            'job_role_ids', 'job_role_names',
        )
        read_only_fields = fields

    def get_job_role_names(self, obj):
        return list(obj.job_roles.values_list('name', flat=True))


class TeamMemberSerializer(serializers.ModelSerializer):
    """Used by the Team list view — includes both active members and pending invitees."""

    job_role_names = serializers.SerializerMethodField()
    job_role_ids = serializers.PrimaryKeyRelatedField(
        source='job_roles', many=True, read_only=True,
    )
    project_count = serializers.IntegerField(source='project_memberships.count', read_only=True)
    is_pending_invite = serializers.SerializerMethodField()
    tracked_hours_this_week = serializers.SerializerMethodField()
    billable_hours_this_week = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'email', 'first_name', 'last_name', 'full_name', 'role',
            'avatar_url', 'employee_id', 'weekly_capacity_hours',
            'job_role_names', 'job_role_ids', 'project_count', 'is_active',
            'invited_at', 'is_pending_invite',
            'tracked_hours_this_week', 'billable_hours_this_week',
        )
        read_only_fields = fields

    def get_job_role_names(self, obj):
        return list(obj.job_roles.values_list('name', flat=True))

    def get_is_pending_invite(self, obj):
        return bool(obj.invitation_token) and not obj.is_active

    def get_tracked_hours_this_week(self, obj) -> str:
        return f'{_user_hours_this_week(obj):.2f}'

    def get_billable_hours_this_week(self, obj) -> str:
        return f'{_user_hours_this_week(obj, billable_only=True):.2f}'


class TeamMemberDetailSerializer(TeamMemberSerializer):
    """Detail view — adds the project memberships list for the edit page."""

    project_memberships = serializers.SerializerMethodField()

    class Meta(TeamMemberSerializer.Meta):
        fields = TeamMemberSerializer.Meta.fields + ('project_memberships',)
        read_only_fields = fields

    def get_project_memberships(self, obj):
        return [
            {
                'project_id': m.project_id,
                'project_name': m.project.name,
                'client_name': m.project.client.name,
                'is_project_manager': m.is_project_manager,
            }
            for m in obj.project_memberships.select_related('project__client').all()
        ]


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs['uid']))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError({'uid': 'Invalid reset link.'})

        if not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError({'token': 'Reset link is invalid or expired.'})

        attrs['user'] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data['user']
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password', 'updated_at'])
        return user


def tokens_for_user(user) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh['email'] = user.email
    refresh['role'] = user.role
    refresh['account_id'] = user.account_id
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }
