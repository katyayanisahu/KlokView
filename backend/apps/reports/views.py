"""
Reports API.

Profitability — implements the Harvest Profitability report.
Revenue = sum(billable_hours x resolved_billable_rate)
Cost    = sum(hours x user.cost_rate)
Profit  = Revenue - Cost

Rate resolution priority (per Project.billable_rate_strategy):
    'person'   → ProjectMembership.hourly_rate (override) ?? User.hourly_rate
    'task'     → ProjectTask.billable_rate (override) ?? Task.default_billable_rate
    'project'  → Project.flat_billable_rate
    'none'     → 0 (project is non-billable)

Role-based scoping (Harvest pattern):
    owner / admin → see everything
    manager       → own entries + entries on projects they manage
    member        → own entries only
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Q
from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.models import ProjectMembership
from apps.timesheets.models import TimeEntry

from .models import SavedReport


def _parse_date(value: str | None, fallback: date) -> date:
    if not value:
        return fallback
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return fallback


def _scope_qs_for_user(user):
    qs = TimeEntry.objects.filter(account_id=user.account_id)
    if user.role in ('owner', 'admin'):
        return qs
    if user.role == 'manager':
        managed_project_ids = ProjectMembership.objects.filter(
            user=user, is_project_manager=True,
        ).values('project_id')
        return qs.filter(Q(user=user) | Q(project_id__in=managed_project_ids))
    return qs.filter(user=user)


def _resolve_billable_rate(entry, *, project_membership_rate_lookup) -> Decimal:
    """Return the billable rate for one TimeEntry per its project's rate strategy."""
    project = entry.project
    strategy = project.billable_rate_strategy
    if strategy == 'none':
        return Decimal('0')
    if strategy == 'project':
        return project.flat_billable_rate or Decimal('0')
    if strategy == 'task':
        # Per-project override on ProjectTask, falling back to the global Task default.
        pt = entry.project_task
        rate = pt.billable_rate if pt and pt.billable_rate is not None else None
        if rate is None and pt and pt.task_id:
            rate = pt.task.default_billable_rate
        return rate or Decimal('0')
    # 'person'
    membership_rate = project_membership_rate_lookup.get(
        (entry.project_id, entry.user_id),
    )
    if membership_rate is not None:
        return membership_rate
    return entry.user.hourly_rate or Decimal('0')


class ProfitabilityReportView(APIView):
    """
    GET /api/v1/reports/profitability/?start=YYYY-MM-DD&end=YYYY-MM-DD

    Returns Revenue / Cost / Profit per group (clients, projects, team, tasks)
    plus workspace totals over the requested window.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        # Default window: this quarter
        quarter_start_month = ((today.month - 1) // 3) * 3 + 1
        default_start = today.replace(month=quarter_start_month, day=1)
        default_end = today

        start = _parse_date(request.query_params.get('start'), default_start)
        end = _parse_date(request.query_params.get('end'), default_end)

        qs = (
            _scope_qs_for_user(request.user)
            .filter(date__gte=start, date__lte=end)
            .select_related('user', 'project__client', 'project_task__task')
        )

        # ---- Profitability filters ----
        project_status = (request.query_params.get('project_status') or '').strip().lower()
        if project_status == 'active':
            qs = qs.filter(project__is_active=True)
        elif project_status == 'archived':
            qs = qs.filter(project__is_active=False)

        project_type = (request.query_params.get('project_type') or '').strip().lower()
        if project_type in ('time_materials', 'fixed_fee', 'non_billable'):
            qs = qs.filter(project__project_type=project_type)

        manager_id = request.query_params.get('project_manager_id')
        if manager_id:
            try:
                managed_project_ids = ProjectMembership.objects.filter(
                    user_id=int(manager_id), is_project_manager=True,
                ).values_list('project_id', flat=True)
                qs = qs.filter(project_id__in=managed_project_ids)
            except (TypeError, ValueError):
                pass

        # ---- Drilldown filters (Harvest pattern: Client → Project) ----
        client_id_param = request.query_params.get('client_id')
        if client_id_param:
            try:
                qs = qs.filter(project__client_id=int(client_id_param))
            except (TypeError, ValueError):
                pass

        project_id_param = request.query_params.get('project_id')
        if project_id_param:
            try:
                qs = qs.filter(project_id=int(project_id_param))
            except (TypeError, ValueError):
                pass

        # Pre-fetch per-(project,user) override rates for the 'person' strategy.
        project_ids = set(qs.values_list('project_id', flat=True))
        user_ids = set(qs.values_list('user_id', flat=True))
        membership_lookup: dict[tuple[int, int], Decimal] = {}
        for pm in ProjectMembership.objects.filter(
            project_id__in=project_ids, user_id__in=user_ids,
        ).only('project_id', 'user_id', 'hourly_rate'):
            if pm.hourly_rate is not None:
                membership_lookup[(pm.project_id, pm.user_id)] = pm.hourly_rate

        # Accumulators
        clients: dict[int, dict] = defaultdict(lambda: _empty_row())
        projects: dict[int, dict] = defaultdict(lambda: _empty_row())
        team: dict[int, dict] = defaultdict(lambda: _empty_row())
        tasks: dict[int, dict] = defaultdict(lambda: _empty_row())

        total_revenue = Decimal('0')
        total_cost = Decimal('0')

        for entry in qs:
            hours = entry.hours or Decimal('0')
            cost_rate = entry.user.cost_rate or Decimal('0')
            cost = hours * cost_rate
            revenue = Decimal('0')
            if entry.is_billable:
                rate = _resolve_billable_rate(
                    entry, project_membership_rate_lookup=membership_lookup,
                )
                revenue = hours * rate

            total_revenue += revenue
            total_cost += cost

            # Clients
            client = entry.project.client
            crow = clients[client.id]
            crow['id'] = client.id
            crow['name'] = client.name
            crow['revenue'] += revenue
            crow['cost'] += cost
            crow['hours'] += hours

            # Projects
            prow = projects[entry.project_id]
            prow['id'] = entry.project_id
            prow['name'] = entry.project.name
            prow['client'] = client.name
            prow['type'] = entry.project.get_project_type_display()
            prow['revenue'] += revenue
            prow['cost'] += cost
            prow['hours'] += hours

            # Team
            trow = team[entry.user_id]
            trow['id'] = entry.user_id
            trow['name'] = entry.user.full_name or entry.user.email
            trow['revenue'] += revenue
            trow['cost'] += cost
            trow['hours'] += hours

            # Tasks (by Task.id from project_task.task)
            task_id = entry.project_task.task_id if entry.project_task else None
            if task_id is not None:
                tk = entry.project_task.task
                trow_t = tasks[task_id]
                trow_t['id'] = task_id
                trow_t['name'] = tk.name if tk else ''
                trow_t['revenue'] += revenue
                trow_t['cost'] += cost
                trow_t['hours'] += hours

        total_profit = total_revenue - total_cost
        margin_percent = _pct(total_profit, total_revenue)

        return Response({
            'window': {'start': start.isoformat(), 'end': end.isoformat()},
            'totals': {
                'revenue': _money(total_revenue),
                'cost': _money(total_cost),
                'profit': _money(total_profit),
                'margin_percent': margin_percent,
            },
            'clients': [_finalize_row(r) for r in clients.values()],
            'projects': [_finalize_row(r) for r in projects.values()],
            'team': [_finalize_row(r) for r in team.values()],
            'tasks': [_finalize_row(r) for r in tasks.values()],
        })


def _empty_row() -> dict:
    return {
        'id': None,
        'name': '',
        'client': '',
        'type': '',
        'revenue': Decimal('0'),
        'cost': Decimal('0'),
        'hours': Decimal('0'),
    }


def _finalize_row(row: dict) -> dict:
    revenue = row['revenue']
    cost = row['cost']
    profit = revenue - cost
    return {
        'id': row['id'],
        'name': row['name'],
        'client': row.get('client', ''),
        'type': row.get('type', ''),
        'revenue': _money(revenue),
        'cost': _money(cost),
        'profit': _money(profit),
        'hours': f'{row["hours"]:.2f}',
        'margin': _pct(profit, revenue),
        'return_on_cost': _pct(profit, cost),
        'has_missing_data': cost == 0 and row['hours'] > 0,
    }


def _money(value: Decimal) -> str:
    return f'{value:.2f}'


def _pct(numerator: Decimal, denominator: Decimal) -> int:
    if not denominator or denominator == 0:
        return 0
    try:
        return int((numerator / denominator) * 100)
    except (ZeroDivisionError, ArithmeticError):
        return 0


class TimeReportView(APIView):
    """
    GET /api/v1/reports/time/?start=YYYY-MM-DD&end=YYYY-MM-DD

    Hours aggregation by clients / projects / tasks / team for the requested window.
    Hours-only — no money. Mirrors Harvest's "Time" report tab.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        # Default window: this week (Mon–Sun)
        default_start = today - timedelta(days=today.weekday())
        default_end = default_start + timedelta(days=6)

        start = _parse_date(request.query_params.get('start'), default_start)
        end = _parse_date(request.query_params.get('end'), default_end)

        qs = (
            _scope_qs_for_user(request.user)
            .filter(date__gte=start, date__lte=end)
            .select_related('user', 'project__client', 'project_task__task')
        )

        active_only = request.query_params.get('active_only')
        if active_only is not None and str(active_only).lower() in ('true', '1', 'yes'):
            qs = qs.filter(project__is_active=True)

        # Drilldown to a single client or project (Harvest pattern: Client → Project → Task)
        client_id_param = request.query_params.get('client_id')
        if client_id_param:
            try:
                qs = qs.filter(project__client_id=int(client_id_param))
            except (TypeError, ValueError):
                pass

        project_id_param = request.query_params.get('project_id')
        if project_id_param:
            try:
                qs = qs.filter(project_id=int(project_id_param))
            except (TypeError, ValueError):
                pass

        # Pre-fetch project membership rate overrides so per-row billable amounts
        # use the same resolution Profitability uses.
        scoped_qs = qs  # snapshot before iteration so we can pull ids from it
        membership_lookup: dict[tuple[int, int], Decimal] = {}
        for pm in ProjectMembership.objects.filter(
            project_id__in=scoped_qs.values_list('project_id', flat=True),
            user_id__in=scoped_qs.values_list('user_id', flat=True),
        ).only('project_id', 'user_id', 'hourly_rate'):
            if pm.hourly_rate is not None:
                membership_lookup[(pm.project_id, pm.user_id)] = pm.hourly_rate

        clients: dict[int, dict] = defaultdict(_empty_time_row)
        projects: dict[int, dict] = defaultdict(_empty_time_row)
        team: dict[int, dict] = defaultdict(_empty_time_row)
        tasks: dict[int, dict] = defaultdict(_empty_time_row)

        # Per-task breakdown of contributing members — only populated when project_id is set.
        # Keyed (task_id, user_id), preserves task_id and user_id for grouping client-side.
        task_member_lookup: dict[tuple[int, int], dict] = {}

        total_hours = Decimal('0')
        billable_hours = Decimal('0')
        total_billable_amount = Decimal('0')

        # Collect users referenced for capacity-based utilization.
        seen_user_capacity: dict[int, Decimal] = {}

        for entry in qs:
            hours = entry.hours or Decimal('0')
            is_billable = bool(entry.is_billable)
            total_hours += hours

            # Cost = hours × user.cost_rate (same as Profitability).
            cost_rate = entry.user.cost_rate or Decimal('0')
            cost = hours * cost_rate

            # Resolve billable amount the same way Profitability does.
            billable_amount = Decimal('0')
            if is_billable:
                billable_hours += hours
                rate = _resolve_billable_rate(
                    entry, project_membership_rate_lookup=membership_lookup,
                )
                billable_amount = hours * rate
                total_billable_amount += billable_amount

            client = entry.project.client
            crow = clients[client.id]
            crow['id'] = client.id
            crow['name'] = client.name
            crow['hours'] += hours
            if is_billable:
                crow['billable_hours'] += hours
            crow['billable_amount'] += billable_amount

            prow = projects[entry.project_id]
            prow['id'] = entry.project_id
            prow['name'] = entry.project.name
            prow['client_id'] = client.id
            prow['client_name'] = client.name
            prow['type'] = entry.project.get_project_type_display()
            prow['hours'] += hours
            if is_billable:
                prow['billable_hours'] += hours
            prow['billable_amount'] += billable_amount

            uid = entry.user_id
            trow = team[uid]
            trow['id'] = uid
            trow['name'] = entry.user.full_name or entry.user.email
            trow['initials'] = _initials(entry.user)
            trow['hours'] += hours
            if is_billable:
                trow['billable_hours'] += hours
            trow['billable_amount'] += billable_amount
            seen_user_capacity[uid] = entry.user.weekly_capacity_hours or Decimal('0')

            task = entry.project_task.task if entry.project_task else None
            if task is not None:
                tk_row = tasks[task.id]
                tk_row['id'] = task.id
                tk_row['name'] = task.name
                tk_row['hours'] += hours
                if is_billable:
                    tk_row['billable_hours'] += hours
                tk_row['billable_amount'] += billable_amount
                tk_row['cost'] += cost

                # Per-task member breakdown (only meaningful in drilldown).
                if project_id_param:
                    key = (task.id, uid)
                    member = task_member_lookup.get(key)
                    if member is None:
                        member = {
                            'task_id': task.id,
                            'user_id': uid,
                            'name': entry.user.full_name or entry.user.email,
                            'initials': _initials(entry.user),
                            'role': entry.user.role,
                            'hours': Decimal('0'),
                            'billable_hours': Decimal('0'),
                            'billable_amount': Decimal('0'),
                            'cost': Decimal('0'),
                            'rate': entry.user.hourly_rate or Decimal('0'),
                            'cost_rate': cost_rate,
                        }
                        task_member_lookup[key] = member
                    member['hours'] += hours
                    if is_billable:
                        member['billable_hours'] += hours
                    member['billable_amount'] += billable_amount
                    member['cost'] += cost

        non_billable_hours = total_hours - billable_hours
        billable_percent = _pct(billable_hours, total_hours)

        # Compute utilization for team rows.
        # Utilization = hours / capacity_for_window.
        # Window length in days for scaling weekly capacity:
        days_in_window = max(1, (end - start).days + 1)
        for uid, row in team.items():
            cap = seen_user_capacity.get(uid, Decimal('0'))
            # Scale weekly capacity by the window length (capacity is hr/week).
            window_capacity = cap * Decimal(days_in_window) / Decimal('7')
            row['utilization'] = _pct(row['hours'], window_capacity)

        # Group task members by task for the drilldown response.
        task_breakdown: list[dict] = []
        if project_id_param:
            members_by_task: dict[int, list[dict]] = defaultdict(list)
            for m in task_member_lookup.values():
                members_by_task[m['task_id']].append({
                    'user_id': m['user_id'],
                    'name': m['name'],
                    'initials': m['initials'],
                    'role': m.get('role', ''),
                    'hours': f'{m["hours"]:.2f}',
                    'billable_hours': f'{m["billable_hours"]:.2f}',
                    'billable_percent': _pct(m['billable_hours'], m['hours']),
                    'rate': f'{m["rate"]:.2f}',
                    'cost_rate': f'{m["cost_rate"]:.2f}',
                    'billable_amount': f'{m["billable_amount"]:.2f}',
                    'cost': f'{m["cost"]:.2f}',
                })
            for tk_row in tasks.values():
                tid = tk_row['id']
                members = sorted(
                    members_by_task.get(tid, []),
                    key=lambda x: x['name'].lower(),
                )
                task_breakdown.append({
                    'id': tid,
                    'name': tk_row['name'],
                    'hours': f'{tk_row["hours"]:.2f}',
                    'billable_hours': f'{tk_row["billable_hours"]:.2f}',
                    'billable_percent': _pct(tk_row['billable_hours'], tk_row['hours']),
                    'billable_amount': f'{tk_row.get("billable_amount", Decimal("0")):.2f}',
                    'cost': f'{tk_row.get("cost", Decimal("0")):.2f}',
                    'members': members,
                })
            task_breakdown.sort(key=lambda x: x['name'].lower())

        return Response({
            'window': {'start': start.isoformat(), 'end': end.isoformat()},
            'totals': {
                'total_hours': f'{total_hours:.2f}',
                'billable_hours': f'{billable_hours:.2f}',
                'non_billable_hours': f'{non_billable_hours:.2f}',
                'billable_percent': billable_percent,
                'billable_amount': f'{total_billable_amount:.2f}',
            },
            'clients': [_finalize_time_row(r) for r in clients.values()],
            'projects': [_finalize_time_row(r) for r in projects.values()],
            'team': [_finalize_time_row(r) for r in team.values()],
            'tasks': [_finalize_time_row(r) for r in tasks.values()],
            'task_breakdown': task_breakdown,
        })


def _empty_time_row() -> dict:
    return {
        'id': None,
        'name': '',
        'hours': Decimal('0'),
        'billable_hours': Decimal('0'),
        'billable_amount': Decimal('0'),
        'cost': Decimal('0'),
        'client_id': None,
        'client_name': '',
        'type': '',
        'initials': '',
        'utilization': 0,
    }


def _finalize_time_row(row: dict) -> dict:
    hours = row['hours']
    billable = row['billable_hours']
    return {
        'id': row['id'],
        'name': row['name'],
        'hours': f'{hours:.2f}',
        'billable_hours': f'{billable:.2f}',
        'billable_percent': _pct(billable, hours),
        'billable_amount': f'{row.get("billable_amount", Decimal("0")):.2f}',
        'cost': f'{row.get("cost", Decimal("0")):.2f}',
        'client_id': row.get('client_id'),
        'client_name': row.get('client_name', ''),
        'type': row.get('type', ''),
        'initials': row.get('initials', ''),
        'utilization': row.get('utilization', 0),
    }


def _initials(user) -> str:
    src = (user.full_name or user.email or '').strip()
    if not src:
        return '?'
    parts = [p for p in src.replace('@', ' ').split() if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    return parts[0][:2].upper() if parts else '?'


class ActivityLogReportView(APIView):
    """
    GET /api/v1/reports/activity/?start=YYYY-MM-DD&end=YYYY-MM-DD&type=timesheet|approval|project

    Returns a chronological feed of activity events.

    Event types (Phase 1):
      - 'timesheet'  → time entry created or updated
      - 'approval'   → submission created (submitted) or decided (approved / rejected)
      - 'project'    → project created (lightweight — uses created_at)

    Frontend mock used the same shape, so the response is a single flat list.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.projects.models import Project
        from apps.timesheets.models import Submission

        today = date.today()
        default_start = today - timedelta(days=7)
        start = _parse_date(request.query_params.get('start'), default_start)
        end = _parse_date(request.query_params.get('end'), today)
        type_filter = request.query_params.get('type', '').strip() or None

        events: list[dict] = []
        user = request.user

        # ---- Time entries ----
        if type_filter in (None, 'timesheet'):
            entries_qs = (
                _scope_qs_for_user(user)
                .filter(date__gte=start, date__lte=end)
                .select_related('user', 'project__client', 'project_task__task')
                .order_by('-created_at')[:200]
            )
            for e in entries_qs:
                created = e.created_at
                events.append({
                    'id': f'te-{e.id}',
                    'type': 'timesheet',
                    'when': created.isoformat(),
                    'date_label': _date_label(created),
                    'time_label': _time_label(created),
                    'activity': f'Tracked {e.hours} hr',
                    'hours': f'{e.hours}',
                    'client': e.project.client.name,
                    'project': e.project.name,
                    'task': e.project_task.task.name if e.project_task and e.project_task.task else '',
                    'performed_by': e.user.full_name or e.user.email,
                })

        # ---- Submissions (timesheet approvals) ----
        if type_filter in (None, 'approval'):
            sub_qs = Submission.objects.filter(account_id=user.account_id)
            if user.role == 'manager':
                managed_user_ids = (
                    ProjectMembership.objects.filter(user=user, is_project_manager=True)
                    .values_list('project__memberships__user_id', flat=True)
                )
                sub_qs = sub_qs.filter(
                    Q(user=user) | Q(user_id__in=managed_user_ids),
                )
            elif user.role not in ('owner', 'admin'):
                sub_qs = sub_qs.filter(user=user)

            sub_qs = sub_qs.filter(
                Q(submitted_at__date__gte=start, submitted_at__date__lte=end)
                | Q(decided_at__date__gte=start, decided_at__date__lte=end),
            ).select_related('user', 'decided_by').order_by('-submitted_at')[:200]

            for s in sub_qs:
                # Submission event
                events.append({
                    'id': f'sub-{s.id}',
                    'type': 'approval',
                    'when': s.submitted_at.isoformat(),
                    'date_label': _date_label(s.submitted_at),
                    'time_label': _time_label(s.submitted_at),
                    'activity': f'Submitted timesheet ({s.start_date} – {s.end_date})',
                    'client': '',
                    'project': '',
                    'task': '',
                    'performed_by': s.user.full_name or s.user.email,
                })
                # Decision event (if any)
                if s.decided_at:
                    events.append({
                        'id': f'sub-{s.id}-decision',
                        'type': 'approval',
                        'when': s.decided_at.isoformat(),
                        'date_label': _date_label(s.decided_at),
                        'time_label': _time_label(s.decided_at),
                        'activity': f'{s.status.capitalize()} timesheet ({s.start_date} – {s.end_date})',
                        'client': '',
                        'project': '',
                        'task': '',
                        'performed_by': (s.decided_by.full_name or s.decided_by.email)
                            if s.decided_by else 'System',
                    })

        # ---- Projects created ----
        if type_filter in (None, 'project'):
            proj_qs = Project.objects.filter(
                account_id=user.account_id,
                created_at__date__gte=start,
                created_at__date__lte=end,
            ).select_related('client').order_by('-created_at')[:100]
            for p in proj_qs:
                events.append({
                    'id': f'prj-{p.id}',
                    'type': 'project',
                    'when': p.created_at.isoformat(),
                    'date_label': _date_label(p.created_at),
                    'time_label': _time_label(p.created_at),
                    'activity': 'Created project',
                    'client': p.client.name,
                    'project': p.name,
                    'task': '',
                    'performed_by': '',
                })

        # Sort everything chronologically (newest first)
        events.sort(key=lambda e: e['when'], reverse=True)

        return Response({
            'window': {'start': start.isoformat(), 'end': end.isoformat()},
            'events': events,
        })


def _date_label(value) -> str:
    return value.strftime('%d/%m/%Y')


def _time_label(value) -> str:
    return value.strftime('%I:%M %p').lstrip('0')


# ---------- Saved Reports ----------


class SavedReportSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = SavedReport
        fields = (
            'id', 'name', 'kind', 'filters', 'is_shared',
            'owner', 'owner_name', 'is_mine',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'owner', 'owner_name', 'is_mine', 'created_at', 'updated_at')

    def get_is_mine(self, obj) -> bool:
        request = self.context.get('request')
        return bool(request and request.user.is_authenticated and obj.owner_id == request.user.id)


class SavedReportViewSet(viewsets.ModelViewSet):
    """List/create/update/delete saved reports.

    Members see their own reports.
    Admins/Owners see their own + reports shared in the workspace.
    """

    serializer_class = SavedReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = SavedReport.objects.filter(account_id=user.account_id)
        if user.role in ('owner', 'admin'):
            qs = qs.filter(Q(owner=user) | Q(is_shared=True))
        else:
            qs = qs.filter(owner=user)

        kind = self.request.query_params.get('kind')
        if kind:
            qs = qs.filter(kind=kind)

        scope = self.request.query_params.get('scope')
        if scope == 'mine':
            qs = qs.filter(owner=user)
        elif scope == 'shared':
            qs = qs.filter(is_shared=True).exclude(owner=user)

        return qs

    def perform_create(self, serializer):
        serializer.save(
            owner=self.request.user,
            account_id=self.request.user.account_id,
        )

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.owner_id != self.request.user.id and self.request.user.role not in (
            'owner', 'admin',
        ):
            raise serializers.ValidationError('Only the owner can edit this report.')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.owner_id != request.user.id and request.user.role not in (
            'owner', 'admin',
        ):
            return Response(
                {'detail': 'Only the owner can delete this report.'},
                status=403,
            )
        return super().destroy(request, *args, **kwargs)
