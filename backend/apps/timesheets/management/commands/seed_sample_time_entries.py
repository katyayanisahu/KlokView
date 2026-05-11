"""Seed a spread of sample TimeEntry rows so reports + filters show variety.

Run:
    python manage.py seed_sample_time_entries           # 60 days, default account
    python manage.py seed_sample_time_entries --days 30
    python manage.py seed_sample_time_entries --account-id 1

Idempotent-ish: skips creating an entry if the same user+project+date already
has at least one entry. Re-running adds variety only on newly empty days.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.accounts.models import Account, User
from apps.projects.models import Project, ProjectMembership, ProjectTask
from apps.timesheets.models import TimeEntry


SAMPLE_NOTES = [
    'Sprint planning + ticket grooming',
    'Bug fix on login flow',
    'Design review with stakeholders',
    'Code review and PR feedback',
    'Customer call + follow-up notes',
    'Documentation update',
    'CI pipeline debugging',
    'Architecture discussion',
    'QA test pass',
    'Refactor utility module',
]


class Command(BaseCommand):
    help = 'Seed sample TimeEntry rows across users, projects, and dates.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=60,
                            help='How many days back to seed (default 60).')
        parser.add_argument('--per-user-per-day', type=int, default=2,
                            help='Max entries per user per workday (default 2).')
        parser.add_argument('--account-id', type=int,
                            help='Restrict to a single account id.')

    def handle(self, *args, **opts):
        days = opts['days']
        per_user = opts['per_user_per_day']
        accounts = (
            Account.objects.filter(id=opts['account_id'])
            if opts.get('account_id')
            else Account.objects.all()
        )

        rng = random.Random(42)  # deterministic-ish

        created = 0
        skipped = 0
        for account in accounts:
            users = list(User.objects.filter(account=account, is_active=True))
            projects = list(
                Project.objects.filter(account=account, is_active=True)
                .prefetch_related('project_tasks')
            )
            if not users or not projects:
                self.stdout.write(self.style.WARNING(
                    f'Skipping account "{account.name}" — no users or projects.',
                ))
                continue

            today = date.today()
            for offset in range(days):
                day = today - timedelta(days=offset)
                # Skip weekends (Mon=0..Sun=6)
                if day.weekday() >= 5:
                    continue
                for user in users:
                    n_entries = rng.randint(0, per_user)
                    for _ in range(n_entries):
                        project = rng.choice(projects)
                        # Make sure user is a member of the project (auto-add if missing)
                        ProjectMembership.objects.get_or_create(
                            project=project, user=user,
                        )
                        project_tasks = list(project.project_tasks.all())
                        if not project_tasks:
                            skipped += 1
                            continue
                        ptask = rng.choice(project_tasks)
                        # Skip if user already has an entry for this project+date
                        if TimeEntry.objects.filter(
                            user=user, project=project, date=day,
                        ).exists():
                            skipped += 1
                            continue
                        hours = Decimal(rng.choice([0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]))
                        TimeEntry.objects.create(
                            account=account,
                            user=user,
                            project=project,
                            project_task=ptask,
                            date=day,
                            hours=hours,
                            notes=rng.choice(SAMPLE_NOTES),
                            is_billable=ptask.is_billable and rng.random() > 0.15,
                        )
                        created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Done. Created {created} new entries, skipped {skipped}.',
        ))
