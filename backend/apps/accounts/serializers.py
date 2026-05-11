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

from .models import Account, JobRole

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
        fields = (
            'id', 'email', 'full_name', 'role', 'avatar_url', 'hourly_rate',
            'home_show_welcome',
        )
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
    hourly_rate = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, min_value=Decimal('0'),
    )
    cost_rate = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, min_value=Decimal('0'),
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
        fields = TeamMemberSerializer.Meta.fields + (
            'project_memberships', 'hourly_rate', 'cost_rate',
        )
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


class MeProfileSerializer(serializers.ModelSerializer):
    """Read serializer for the logged-in user's full profile (used by /auth/me/profile/)."""

    project_memberships = serializers.SerializerMethodField()
    job_role_names = serializers.SerializerMethodField()
    job_role_ids = serializers.PrimaryKeyRelatedField(
        source='job_roles', many=True, read_only=True,
    )
    notification_prefs = serializers.SerializerMethodField()
    account_timezone = serializers.CharField(source='account.timezone', read_only=True)

    class Meta:
        model = User
        fields = (
            'id', 'email', 'full_name', 'first_name', 'last_name', 'role',
            'avatar_url', 'employee_id', 'weekly_capacity_hours',
            'timezone', 'account_timezone', 'home_show_welcome',
            'job_role_ids', 'job_role_names',
            'notification_prefs', 'project_memberships',
        )
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

    def get_job_role_names(self, obj):
        return list(obj.job_roles.values_list('name', flat=True))

    def get_notification_prefs(self, obj):
        from .models import merged_notification_prefs
        return merged_notification_prefs(obj)


class MeProfileUpdateSerializer(serializers.Serializer):
    """Patch serializer for the logged-in user's editable profile fields."""

    first_name = serializers.CharField(max_length=75, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=75, required=False, allow_blank=True)
    employee_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    weekly_capacity_hours = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, min_value=Decimal('0'),
    )
    timezone = serializers.CharField(max_length=64, required=False, allow_blank=True)
    avatar_url = serializers.URLField(required=False, allow_blank=True)
    home_show_welcome = serializers.BooleanField(required=False)
    job_role_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=JobRole.objects.all(), required=False,
    )

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


class MeNotificationsSerializer(serializers.Serializer):
    """All notification toggles. All fields optional on PATCH."""

    reminder_personal_daily = serializers.BooleanField(required=False)
    reminder_team_wide = serializers.BooleanField(required=False)
    weekly_email = serializers.BooleanField(required=False)
    approval_email_people = serializers.BooleanField(required=False)
    approval_email_projects = serializers.BooleanField(required=False)
    approval_email_approved = serializers.BooleanField(required=False)
    project_deleted_email = serializers.BooleanField(required=False)
    product_updates_email = serializers.BooleanField(required=False)


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


class AccountSettingsSerializer(serializers.ModelSerializer):
    """Workspace-level settings: Preferences, Modules, Sign-in security."""

    owner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True,
    )
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)
    owner_email = serializers.CharField(source='owner.email', read_only=True)
    eligible_owners = serializers.SerializerMethodField()
    has_sample_data = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = (
            'id', 'name',
            'owner', 'owner_name', 'owner_email', 'eligible_owners',
            'has_sample_data',
            # Preferences
            'timezone', 'fiscal_year_start_month', 'week_starts_on',
            'default_capacity_hours', 'timesheet_deadline',
            'date_format', 'time_format', 'time_display', 'timer_mode',
            'currency', 'number_format',
            # Modules
            'enabled_modules',
            # Sign-in security
            'require_two_factor', 'allow_google_sso', 'allow_microsoft_sso',
            'session_timeout_minutes', 'login_alerts',
            'updated_at',
        )
        read_only_fields = (
            'id', 'owner_name', 'owner_email', 'eligible_owners',
            'has_sample_data', 'updated_at',
        )

    def get_has_sample_data(self, obj) -> bool:
        from apps.clients.models import Client
        return Client.objects.filter(account_id=obj.id, name__startswith='[SAMPLE]').exists()

    def get_eligible_owners(self, obj) -> list[dict]:
        """Active owner/admin users in this workspace who can be the Account Owner."""
        qs = (
            User.objects.filter(
                account_id=obj.id,
                is_active=True,
                role__in=[User.Role.OWNER, User.Role.ADMIN],
            )
            .order_by('full_name', 'email')
        )
        return [
            {
                'id': u.id,
                'full_name': u.full_name or u.email,
                'email': u.email,
                'role': u.role,
            }
            for u in qs
        ]

    def validate_owner(self, value):
        if value is None:
            raise serializers.ValidationError('Account owner is required.')
        if value.account_id != self.instance.id:
            raise serializers.ValidationError(
                'New owner must belong to this workspace.',
            )
        if value.role not in (User.Role.OWNER, User.Role.ADMIN):
            raise serializers.ValidationError(
                'Only employees with Administrator or Owner permissions can become the Account Owner.',
            )
        if not value.is_active:
            raise serializers.ValidationError('Cannot assign an archived user as the Account Owner.')
        return value


def tokens_for_user(user) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh['email'] = user.email
    refresh['role'] = user.role
    refresh['account_id'] = user.account_id
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }
