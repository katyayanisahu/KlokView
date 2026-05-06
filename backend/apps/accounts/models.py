from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Account(models.Model):
    """A tenant / workspace. All data belongs to exactly one Account."""

    name = models.CharField(max_length=150)
    owner = models.ForeignKey(
        'User', on_delete=models.PROTECT, related_name='owned_accounts',
        null=True, blank=True,
    )
    is_active = models.BooleanField(default=True)
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
