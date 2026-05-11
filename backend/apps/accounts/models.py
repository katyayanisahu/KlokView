from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Account(models.Model):
    """A tenant / workspace. All data belongs to exactly one Account."""

    class WeekStart(models.TextChoices):
        MONDAY = 'monday', 'Monday'
        SUNDAY = 'sunday', 'Sunday'

    class DateFormat(models.TextChoices):
        DMY_SLASH = 'DD/MM/YYYY', 'DD/MM/YYYY'
        MDY_SLASH = 'MM/DD/YYYY', 'MM/DD/YYYY'
        YMD_DASH = 'YYYY-MM-DD', 'YYYY-MM-DD'

    class TimeFormat(models.TextChoices):
        H12 = '12h', '12-hour clock'
        H24 = '24h', '24-hour clock'

    class TimeDisplay(models.TextChoices):
        HMM = 'hh_mm', 'HH:MM'
        DECIMAL = 'decimal', 'Decimal hours'

    class TimerMode(models.TextChoices):
        DURATION = 'duration', 'Track time via duration'
        START_END = 'start_end', 'Track time via start and end time'

    name = models.CharField(max_length=150)
    owner = models.ForeignKey(
        'User', on_delete=models.PROTECT, related_name='owned_accounts',
        null=True, blank=True,
    )
    is_active = models.BooleanField(default=True)

    # ---- Preferences ----
    timezone = models.CharField(max_length=64, default='Asia/Kolkata')
    fiscal_year_start_month = models.IntegerField(default=1, help_text='1-12, month the fiscal year starts')
    week_starts_on = models.CharField(
        max_length=10, choices=WeekStart.choices, default=WeekStart.MONDAY,
    )
    default_capacity_hours = models.DecimalField(
        max_digits=5, decimal_places=2, default=35,
    )
    timesheet_deadline = models.CharField(
        max_length=64, blank=True, default='',
        help_text='Free-form deadline like "Friday at 5:00pm". Used for reminders later.',
    )
    date_format = models.CharField(
        max_length=12, choices=DateFormat.choices, default=DateFormat.DMY_SLASH,
    )
    time_format = models.CharField(
        max_length=4, choices=TimeFormat.choices, default=TimeFormat.H12,
    )
    time_display = models.CharField(
        max_length=10, choices=TimeDisplay.choices, default=TimeDisplay.HMM,
    )
    timer_mode = models.CharField(
        max_length=12, choices=TimerMode.choices, default=TimerMode.DURATION,
    )
    currency = models.CharField(max_length=8, default='INR')
    number_format = models.CharField(max_length=16, default='1,234.56')

    # ---- Modules (toggles for which features are enabled in this workspace) ----
    enabled_modules = models.JSONField(
        default=dict, blank=True,
        help_text='Per-module on/off flags, e.g. {"timesheet_approval": true, "reports": true}',
    )

    # ---- Sign-in security (account-level) ----
    require_two_factor = models.BooleanField(default=False)
    allow_google_sso = models.BooleanField(default=False)
    allow_microsoft_sso = models.BooleanField(default=False)
    session_timeout_minutes = models.IntegerField(default=480)
    login_alerts = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('Users must have an email address')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.ADMIN)
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        OWNER = 'owner', 'Owner'
        ADMIN = 'admin', 'Admin'
        MANAGER = 'manager', 'Manager'
        MEMBER = 'member', 'Member'

    account = models.ForeignKey(
        Account, on_delete=models.PROTECT, related_name='users',
    )
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)
    first_name = models.CharField(max_length=75, blank=True, default='')
    last_name = models.CharField(max_length=75, blank=True, default='')
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.OWNER)
    avatar_url = models.URLField(blank=True, default='')
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cost_rate = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="Cost rate for this user (what we pay per hour). Used in Profitability reports.",
    )

    employee_id = models.CharField(
        max_length=100, blank=True, default='',
        help_text='Optional unique identifier for this employee within the organization.',
    )
    weekly_capacity_hours = models.DecimalField(
        max_digits=5, decimal_places=2, default=35,
        help_text='Hours per week this person is available to work. Used for utilization reports.',
    )

    timezone = models.CharField(
        max_length=64, blank=True, default='',
        help_text='IANA timezone name (e.g. "Asia/Kolkata"). Blank falls back to account timezone.',
    )
    home_show_welcome = models.BooleanField(
        default=True,
        help_text='Show the dashboard welcome banner for this user.',
    )
    notification_prefs = models.JSONField(
        default=dict, blank=True,
        help_text=(
            'Per-user notification preferences. Keys: '
            'reminder_personal_daily, reminder_team_wide, weekly_email, '
            'approval_email_people, approval_email_projects, approval_email_approved, '
            'project_deleted_email, product_updates_email.'
        ),
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    invitation_token = models.CharField(max_length=64, blank=True, default='', db_index=True)
    invited_at = models.DateTimeField(null=True, blank=True)
    invited_by = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='invitations_sent'
    )

    job_roles = models.ManyToManyField(
        'JobRole', related_name='users', blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        db_table = 'users'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.email


DEFAULT_NOTIFICATION_PREFS = {
    'reminder_personal_daily': False,
    'reminder_team_wide': True,
    'weekly_email': True,
    'approval_email_people': True,
    'approval_email_projects': True,
    'approval_email_approved': False,
    'project_deleted_email': False,
    'product_updates_email': True,
}


def merged_notification_prefs(user) -> dict:
    """Return user's notification prefs merged over the defaults."""
    prefs = dict(DEFAULT_NOTIFICATION_PREFS)
    if user.notification_prefs:
        prefs.update(user.notification_prefs)
    return prefs


class JobRole(models.Model):
    """A workspace-defined label for people (e.g. Designer, Senior, NYC).

    Distinct from User.role (Owner/Admin/Manager/Member permission level) — these
    are organizational labels for filtering reports and team views.
    """

    account = models.ForeignKey(
        Account, on_delete=models.CASCADE, related_name='job_roles',
    )
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'job_roles'
        ordering = ['name']
        unique_together = [('account', 'name')]

    def __str__(self) -> str:
        return self.name
