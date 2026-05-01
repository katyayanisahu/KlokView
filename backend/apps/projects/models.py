from django.conf import settings
from django.db import models


class Task(models.Model):
    """Global task library (workspace-scoped). Projects pull from this list."""

    account = models.ForeignKey(
        'accounts.Account', on_delete=models.CASCADE, related_name='tasks',
    )
    name = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False, help_text='Auto-added to new projects.')
    default_is_billable = models.BooleanField(default=True)
    default_billable_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='Default billable rate for this task. NULL = use project/user rate.',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tasks'
        ordering = ['name']
        unique_together = [('account', 'name')]

    def __str__(self) -> str:
        return self.name


class Project(models.Model):
    class ProjectType(models.TextChoices):
        TIME_MATERIALS = 'time_materials', 'Time & Materials'
        FIXED_FEE = 'fixed_fee', 'Fixed Fee'
        NON_BILLABLE = 'non_billable', 'Non-Billable'

    class BudgetType(models.TextChoices):
        NONE = 'none', 'No budget'
        TOTAL_FEES = 'total_fees', 'Total project fees'
        TOTAL_HOURS = 'total_hours', 'Total project hours'
        HOURS_PER_TASK = 'hours_per_task', 'Hours per task'
        FEES_PER_TASK = 'fees_per_task', 'Fees per task'

    class Visibility(models.TextChoices):
        ADMINS_AND_MANAGERS = 'admins_and_managers', 'Admins and managers only'
        EVERYONE = 'everyone', 'Everyone on project'

    account = models.ForeignKey(
        'accounts.Account', on_delete=models.CASCADE, related_name='projects',
    )
    client = models.ForeignKey('clients.Client', on_delete=models.PROTECT, related_name='projects')
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True, default='')

    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    visibility = models.CharField(
        max_length=30, choices=Visibility.choices, default=Visibility.ADMINS_AND_MANAGERS
    )
    project_type = models.CharField(
        max_length=20, choices=ProjectType.choices, default=ProjectType.TIME_MATERIALS
    )

    budget_type = models.CharField(
        max_length=20, choices=BudgetType.choices, default=BudgetType.NONE
    )
    budget_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    budget_resets_monthly = models.BooleanField(default=False)
    budget_includes_non_billable = models.BooleanField(default=False)
    budget_alert_percent = models.PositiveSmallIntegerField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    tasks = models.ManyToManyField(Task, through='ProjectTask', related_name='projects')
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL, through='ProjectMembership', related_name='projects'
    )

    class Meta:
        db_table = 'projects'
        ordering = ['name']

    def __str__(self) -> str:
        return f'{self.client.name} / {self.name}'


class ProjectTask(models.Model):
    """Junction: a task enabled for a project with an optional billable override."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='project_tasks')
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='project_tasks')
    is_billable = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_tasks'
        unique_together = [('project', 'task')]
        ordering = ['task__name']


class ProjectMembership(models.Model):
    """Junction: a user assigned to a project with an optional rate override and manager flag."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='project_memberships'
    )
    hourly_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='Per-user rate override on this project. NULL = use project/task default.',
    )
    is_project_manager = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_memberships'
        unique_together = [('project', 'user')]
        ordering = ['user__full_name']
