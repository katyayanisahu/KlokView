"""Populate empty projects with realistic budget + time data for demos and testing.

Distributes existing **unconfigured** projects (those with budget_type='none') across
the three project types in rotation so the Profitability report filters show clearly
distinguishable data:

    - Time & Materials -> person billable rate, hours budget, billable entries
    - Fixed Fee        -> project flat rate, hours budget, billable entries
    - Non-Billable     -> no revenue, hours budget tracks effort only

Also seeds:
    - Project memberships (2-4 active users per project)
    - Project tasks (all default workspace tasks if none attached)
    - User cost_rate + hourly_rate (only if currently 0)
    - TimeEntry rows spread across Jan 1 of this year through today,
      with extra density in the last 2 months

Run:
    python manage.py seed_demo_data                  # all accounts, only empty projects
    python manage.py seed_demo_data --account-id 1
    python manage.py seed_demo_data --force          # re-seed even configured projects
    python manage.py seed_demo_data --dry-run        # preview without writing

Idempotent — re-running is safe. By default, projects that already have a budget
configured are left alone (use --force to override).
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.accounts.models import Account, User
from apps.projects.models import (
    Project,
    ProjectMembership,
    ProjectTask,
    Task,
)
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
    'Pair programming session',
    'Standup + async updates',
]


# Per-type configuration profiles. Cycling through these ensures variety
# across whatever set of empty projects exists in the workspace.
TYPE_PROFILES = [
    {
        'project_type': Project.ProjectType.TIME_MATERIALS,
        'billable_rate_strategy': Project.BillableRateStrategy.PERSON,
        'flat_billable_rate': None,
        'budget_range_hours': (200, 800),
        'utilization_range': (0.45, 0.85),
        'billable_probability': 0.92,
    },
    {
        'project_type': Project.ProjectType.FIXED_FEE,
        'billable_rate_strategy': Project.BillableRateStrategy.PROJECT,
        'flat_billable_rate': Decimal('1500.00'),
        'budget_range_hours': (100, 400),
        'utilization_range': (0.30, 0.75),
        'billable_probability': 0.85,
    },
    {
        'project_type': Project.ProjectType.NON_BILLABLE,
        'billable_rate_strategy': Project.BillableRateStrategy.NONE,
        'flat_billable_rate': None,
        'budget_range_hours': (50, 150),
        'utilization_range': (0.40, 0.90),
        'billable_probability': 0.0,
    },
]


class Command(BaseCommand):
    help = (
        'Populate empty projects with budgets, members, tasks, rates and time '
        'entries so reports + filters show realistic variety.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--account-id', type=int,
            help='Restrict to a single account id. Otherwise processes all accounts.',
        )
        parser.add_argument(
            '--force', action='store_true',
            help='Re-configure projects even if they already have a budget set.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Show what would be done without writing to the database.',
        )

    def handle(self, *args, **opts):
        self.dry_run = opts['dry_run']
        self.force = opts['force']
        rng = random.Random(42)  # deterministic across re-runs

        accounts = (
            Account.objects.filter(id=opts['account_id'])
            if opts.get('account_id')
            else Account.objects.all()
        )

        totals = {
            'projects_configured': 0,
            'memberships_added': 0,
            'tasks_attached': 0,
            'time_entries_created': 0,
            'users_rated': 0,
        }

        for account in accounts:
            self._seed_account(account, rng, totals)

        action = 'Would have' if self.dry_run else 'Done.'
        self.stdout.write(self.style.SUCCESS(
            f'{action} Configured {totals["projects_configured"]} project(s), '
            f'added {totals["memberships_added"]} membership(s), '
            f'attached tasks to {totals["tasks_attached"]} project(s), '
            f'set rates on {totals["users_rated"]} user(s), '
            f'created {totals["time_entries_created"]} time entry row(s).'
        ))
        if self.dry_run:
            self.stdout.write(self.style.WARNING('Dry-run mode — no changes written.'))

    # ----------------------------------------------------------------- per-account

    def _seed_account(self, account, rng, totals):
        users = list(User.objects.filter(account=account, is_active=True))
        if not users:
            self.stdout.write(self.style.WARNING(
                f'Skipping "{account.name}" - no active users.',
            ))
            return

        # Pick candidate projects: those without a configured budget. With --force,
        # process every active project regardless of state.
        project_qs = Project.objects.filter(account=account, is_active=True)
        if not self.force:
            project_qs = project_qs.filter(budget_type=Project.BudgetType.NONE)
        projects = list(project_qs.order_by('id'))

        if not projects:
            self.stdout.write(
                f'"{account.name}" - no empty projects to configure '
                '(use --force to re-seed configured projects).',
            )
            return

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\n== "{account.name}" - {len(projects)} project(s) to configure =='
        ))

        # 1. Ensure every active user has cost + hourly rates set (so Profitability
        # report shows non-zero costs and Revenue can resolve via 'person' strategy).
        for user in users:
            updated_fields = []
            if user.hourly_rate == 0:
                user.hourly_rate = Decimal(rng.choice([1200, 1500, 1800, 2000, 2500, 3000]))
                updated_fields.append('hourly_rate')
            if user.cost_rate == 0:
                # Cost ≈ 55-70% of hourly_rate so profit margins are positive but realistic.
                margin = Decimal(rng.choice([0.55, 0.60, 0.65, 0.70]))
                user.cost_rate = (user.hourly_rate * margin).quantize(Decimal('0.01'))
                updated_fields.append('cost_rate')
            if updated_fields and not self.dry_run:
                user.save(update_fields=updated_fields)
            if updated_fields:
                totals['users_rated'] += 1

        # 2. Available workspace tasks to attach to projects that have none.
        workspace_tasks = list(
            Task.objects.filter(account=account, is_active=True, is_default=True)
        )
        if not workspace_tasks:
            workspace_tasks = list(
                Task.objects.filter(account=account, is_active=True)[:5]
            )

        # 3. Process each project — assigning a type profile in rotation.
        for idx, project in enumerate(projects):
            profile = TYPE_PROFILES[idx % len(TYPE_PROFILES)]
            self._configure_project(
                project, profile, users, workspace_tasks, rng, totals,
            )

    # ------------------------------------------------------------- per-project

    def _configure_project(self, project, profile, users, workspace_tasks, rng, totals):
        budget_hours = Decimal(
            rng.randint(*profile['budget_range_hours'])
        )

        # --- Project fields ---
        project.project_type = profile['project_type']
        project.billable_rate_strategy = profile['billable_rate_strategy']
        project.flat_billable_rate = profile['flat_billable_rate']
        project.budget_type = Project.BudgetType.TOTAL_HOURS
        project.budget_amount = budget_hours
        project.budget_alert_percent = 80
        if not self.dry_run:
            project.save(update_fields=[
                'project_type', 'billable_rate_strategy', 'flat_billable_rate',
                'budget_type', 'budget_amount', 'budget_alert_percent',
            ])
        totals['projects_configured'] += 1

        # --- Tasks: attach default workspace tasks if project has none ---
        existing_pts = list(project.project_tasks.all())
        if not existing_pts and workspace_tasks:
            for task in workspace_tasks:
                # Non-Billable projects shouldn't auto-create billable tasks.
                is_billable = (
                    task.default_is_billable
                    and profile['project_type'] != Project.ProjectType.NON_BILLABLE
                )
                if not self.dry_run:
                    ProjectTask.objects.get_or_create(
                        project=project,
                        task=task,
                        defaults={'is_billable': is_billable},
                    )
            totals['tasks_attached'] += 1
            existing_pts = list(project.project_tasks.all())

        if not existing_pts:
            self.stdout.write(self.style.WARNING(
                f'  - "{project.name}" - no tasks available; skipping time entries.',
            ))
            return

        # --- Members: ensure 2-4 active users assigned ---
        member_count_target = min(rng.randint(2, 4), len(users))
        chosen_members = rng.sample(users, member_count_target)
        for user in chosen_members:
            already_member = ProjectMembership.objects.filter(
                project=project, user=user,
            ).exists()
            if already_member:
                continue
            if not self.dry_run:
                ProjectMembership.objects.create(project=project, user=user)
            totals['memberships_added'] += 1

        # --- Time entries: spread across current year + recent 2 months ---
        target_hours = budget_hours * Decimal(
            rng.uniform(*profile['utilization_range'])
        )
        created = self._seed_time_entries(
            project=project,
            target_hours=target_hours,
            members=chosen_members,
            project_tasks=existing_pts,
            billable_probability=profile['billable_probability'],
            rng=rng,
        )
        totals['time_entries_created'] += created

        self.stdout.write(
            f'  - "{project.name}" -> {profile["project_type"]}, '
            f'budget {budget_hours}hr, target {target_hours:.0f}hr, '
            f'{member_count_target} member(s), {created} entries'
        )

    # ----------------------------------------------------------- time entries

    def _seed_time_entries(
        self, *, project, target_hours, members, project_tasks,
        billable_probability, rng,
    ):
        """Generate weekday entries totaling ~target_hours across the year so far.

        Date distribution: 70% of entries land in the last 2 months (recency
        bias for dashboards), 30% spread across earlier months of current year.
        """
        if not members or not project_tasks:
            return 0

        today = date.today()
        year_start = date(today.year, 1, 1)
        recent_cutoff = today - timedelta(days=60)

        recent_weekdays = _weekdays_between(recent_cutoff, today)
        early_weekdays = _weekdays_between(year_start, recent_cutoff - timedelta(days=1))

        created = 0
        accumulated = Decimal('0')
        attempts = 0
        max_attempts = 500  # safety cap to avoid infinite loops

        while accumulated < target_hours and attempts < max_attempts:
            attempts += 1
            # 70% recent, 30% earlier
            if recent_weekdays and (not early_weekdays or rng.random() < 0.7):
                day = rng.choice(recent_weekdays)
            elif early_weekdays:
                day = rng.choice(early_weekdays)
            else:
                break

            user = rng.choice(members)

            # Skip if this user already has an entry on this project+date — keeps
            # the dataset from clustering and matches the existing seeder pattern.
            if TimeEntry.objects.filter(
                user=user, project=project, date=day,
            ).exists():
                continue

            ptask = rng.choice(project_tasks)
            hours = Decimal(rng.choice([0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0]))

            is_billable = (
                ptask.is_billable and rng.random() < billable_probability
            )

            if not self.dry_run:
                TimeEntry.objects.create(
                    account=project.account,
                    user=user,
                    project=project,
                    project_task=ptask,
                    date=day,
                    hours=hours,
                    notes=rng.choice(SAMPLE_NOTES),
                    is_billable=is_billable,
                )
            accumulated += hours
            created += 1

        return created


def _weekdays_between(start: date, end: date) -> list[date]:
    """Return all Mon-Fri dates in [start, end] inclusive."""
    if end < start:
        return []
    days = []
    cursor = start
    while cursor <= end:
        if cursor.weekday() < 5:
            days.append(cursor)
        cursor += timedelta(days=1)
    return days
