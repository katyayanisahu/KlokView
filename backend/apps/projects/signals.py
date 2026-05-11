from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import Account

from .models import Task


COMMON_TASKS = [
    {'name': 'Business Development', 'default_is_billable': False},
    {'name': 'Design', 'default_is_billable': True},
    {'name': 'Marketing', 'default_is_billable': True},
    {'name': 'Programming', 'default_is_billable': True},
    {'name': 'Project Management', 'default_is_billable': True},
]


def seed_common_tasks_for_account(account: Account) -> int:
    """Create the default common-task library for a workspace.

    Idempotent: skips any task name that already exists on the account.
    Returns the number of tasks created.
    """
    existing = set(account.tasks.values_list('name', flat=True))
    to_create = [
        Task(
            account=account,
            name=spec['name'],
            is_default=True,
            default_is_billable=spec['default_is_billable'],
            default_billable_rate=None,
        )
        for spec in COMMON_TASKS
        if spec['name'] not in existing
    ]
    if not to_create:
        return 0
    Task.objects.bulk_create(to_create)
    return len(to_create)


@receiver(post_save, sender=Account)
def seed_common_tasks_on_account_create(sender, instance, created, **kwargs):
    if not created:
        return
    seed_common_tasks_for_account(instance)
