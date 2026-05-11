from django.core.management.base import BaseCommand

from apps.accounts.models import Account
from apps.projects.signals import seed_common_tasks_for_account


class Command(BaseCommand):
    help = (
        'Backfill the common-task library for accounts that are missing it. '
        'Idempotent — re-running is safe.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--account-id',
            type=int,
            help='Only seed this one account (by ID). Otherwise seeds every account.',
        )

    def handle(self, *args, **options):
        if options.get('account_id'):
            qs = Account.objects.filter(id=options['account_id'])
        else:
            qs = Account.objects.all()

        total_created = 0
        for account in qs:
            n = seed_common_tasks_for_account(account)
            total_created += n
            self.stdout.write(
                f'{account.name} (id={account.id}): created {n} task(s)'
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Created {total_created} task(s) across {qs.count()} account(s).'
            )
        )
