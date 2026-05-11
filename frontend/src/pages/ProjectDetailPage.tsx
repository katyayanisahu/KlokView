import {
  Archive,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useConfirm } from '@/components/ConfirmDialog';
import {
  addProjectMember,
  addProjectTask,
  archiveProject,
  deleteProject,
  duplicateProject,
  getProject,
  listTasks,
  removeProjectMember,
  removeProjectTask,
  restoreProject,
  updateProject,
} from '@/api/projects';
import {
  getTimeReport,
  type TaskBreakdownRow,
  type TeamBreakdownRow,
} from '@/api/reports';
import { listUsers } from '@/api/users';
import { downloadCsv, timestampedFilename } from '@/components/reports/csvExport';
import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import { formatBudget, formatCurrency, useCurrencySymbol } from '@/utils/format';
import type { BudgetType, ProjectDetail, ProjectVisibility, Task, User } from '@/types';

type TabKey = 'tasks' | 'team';
type ChartKey = 'progress' | 'hours';
type RangeKey =
  | 'this_week'
  | 'this_semimonth'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'all_time'
  | 'custom';

const RANGE_LABEL: Record<RangeKey, string> = {
  this_week: 'Week',
  this_semimonth: 'Semimonth',
  this_month: 'Month',
  this_quarter: 'Quarter',
  this_year: 'Year',
  all_time: 'All time',
  custom: 'Custom',
};

function computeRangeDates(
  range: RangeKey,
  customStart?: string,
  customEnd?: string,
): { start?: string; end?: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (range === 'custom') {
    return {
      start: customStart || iso(today),
      end: customEnd || iso(today),
    };
  }
  if (range === 'all_time') {
    return { start: '2000-01-01', end: iso(today) };
  }
  if (range === 'this_week') {
    const dow = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: iso(start), end: iso(end) };
  }
  if (range === 'this_semimonth') {
    const y = today.getFullYear();
    const m = today.getMonth();
    const firstHalf = today.getDate() <= 15;
    const start = new Date(y, m, firstHalf ? 1 : 16);
    const end = firstHalf ? new Date(y, m, 15) : new Date(y, m + 1, 0);
    return { start: iso(start), end: iso(end) };
  }
  if (range === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: iso(start), end: iso(end) };
  }
  if (range === 'this_quarter') {
    const q = Math.floor(today.getMonth() / 3);
    const start = new Date(today.getFullYear(), q * 3, 1);
    const end = new Date(today.getFullYear(), q * 3 + 3, 0);
    return { start: iso(start), end: iso(end) };
  }
  // this_year
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  return { start: iso(start), end: iso(end) };
}

function formatDateRangeLabel(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sameYear = s.getFullYear() === e.getFullYear();
  const monthFmt: Intl.DateTimeFormatOptions = { month: 'short' };
  const fullFmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  if (sameMonth) {
    return `${s.getDate()} – ${e.getDate()} ${s.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  }
  if (sameYear) {
    return `${s.getDate()} ${s.toLocaleDateString('en-US', monthFmt)} – ${e.getDate()} ${e.toLocaleDateString('en-US', monthFmt)} ${s.getFullYear()}`;
  }
  return `${s.toLocaleDateString('en-US', fullFmt)} – ${e.toLocaleDateString('en-US', fullFmt)}`;
}

function formatRangeHeader(range: Exclude<RangeKey, 'all_time' | 'custom'>): string {
  const { start, end } = computeRangeDates(range);
  return formatDateRangeLabel(start, end);
}

export default function ProjectDetailPage() {
  // Re-render when the workspace currency / number_format changes in Settings.
  useAccountSettingsStore((s) => s.settings?.currency);
  useAccountSettingsStore((s) => s.settings?.number_format);

  const { id } = useParams<{ id: string }>();
  const projectId = id ? Number.parseInt(id, 10) : NaN;
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'owner' || user?.role === 'admin';
  const { confirmDialog, ask } = useConfirm();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('tasks');
  const [chartView, setChartView] = useState<ChartKey>('progress');
  const [range, setRange] = useState<RangeKey>('all_time');
  const [chartRange, setChartRange] = useState<RangeKey>('this_week');
  const [chartWindowHours, setChartWindowHours] = useState<number>(0);
  const [chartWindowBillable, setChartWindowBillable] = useState<number>(0);
  const [chartLoading, setChartLoading] = useState(false);
  // Custom date pickers — default both pickers to current week so 'Custom'
  // starts with a sensible range rather than empty inputs.
  const initialCustom = useMemo(() => computeRangeDates('this_week'), []);
  const [chartCustomStart, setChartCustomStart] = useState<string>(initialCustom.start ?? '');
  const [chartCustomEnd, setChartCustomEnd] = useState<string>(initialCustom.end ?? '');
  const [tableCustomStart, setTableCustomStart] = useState<string>(initialCustom.start ?? '');
  const [tableCustomEnd, setTableCustomEnd] = useState<string>(initialCustom.end ?? '');
  const [showFullNotes, setShowFullNotes] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (Number.isNaN(projectId)) {
      setError('Invalid project id');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getProject(projectId)
      .then((p) => {
        if (!cancelled) setProject(p);
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiError(err, 'Failed to load project'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const refreshProject = async () => {
    const p = await getProject(projectId);
    setProject(p);
  };

  // Refetch real hours for the chart whenever the chart range changes.
  // Uses the same time-report endpoint as the task breakdown table so chart + table
  // numbers stay consistent for the same window.
  useEffect(() => {
    if (Number.isNaN(projectId)) return;
    let cancelled = false;
    setChartLoading(true);
    const { start, end } = computeRangeDates(chartRange, chartCustomStart, chartCustomEnd);
    getTimeReport({ project_id: projectId, start, end })
      .then((data) => {
        if (cancelled) return;
        setChartWindowHours(Number.parseFloat(data.totals.total_hours ?? '0'));
        setChartWindowBillable(Number.parseFloat(data.totals.billable_hours ?? '0'));
      })
      .catch(() => {
        if (cancelled) return;
        setChartWindowHours(0);
        setChartWindowBillable(0);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, chartRange, chartCustomStart, chartCustomEnd]);

  const handleArchive = async () => {
    const ok = await ask({
      title: `Archive "${project?.name}"?`,
      message: 'Archived projects are hidden from active lists. You can restore anytime.',
      confirmLabel: 'Archive',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await archiveProject(projectId);
      setProject((prev) => (prev ? { ...prev, is_active: false } : prev));
      setActionsOpen(false);
    } catch (err) {
      alert(extractApiError(err, 'Failed to archive project.'));
    }
  };

  const handleRestore = async () => {
    try {
      const updated = await restoreProject(projectId);
      setProject(updated);
      setActionsOpen(false);
    } catch (err) {
      alert(extractApiError(err, 'Failed to restore project.'));
    }
  };

  const handleDuplicate = async () => {
    try {
      const copy = await duplicateProject(projectId);
      navigate(`/projects/${copy.id}`);
    } catch (err) {
      alert(extractApiError(err, 'Failed to duplicate project.'));
    }
  };

  const handleExport = async () => {
    if (!project) return;
    setExporting(true);
    try {
      const data = await getTimeReport({ project_id: project.id });
      const headers = ['Task', 'Member', 'Role', 'Hours', 'Billable amount', 'Cost', 'Billable'];
      const rows: (string | number)[][] = [];
      (data.task_breakdown ?? []).forEach((task) => {
        rows.push([
          task.name,
          '',
          '',
          Number.parseFloat(task.hours ?? '0').toFixed(2),
          Number.parseFloat(task.billable_amount ?? '0').toFixed(2),
          Number.parseFloat(task.cost ?? '0').toFixed(2),
          '',
        ]);
        (task.members ?? []).forEach((m) => {
          rows.push([
            task.name,
            m.name,
            m.role ?? '',
            Number.parseFloat(m.hours ?? '0').toFixed(2),
            Number.parseFloat(m.billable_amount ?? '0').toFixed(2),
            Number.parseFloat(m.cost ?? '0').toFixed(2),
            '',
          ]);
        });
      });
      const safeName = project.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      downloadCsv({
        filename: timestampedFilename(`project_${safeName}`),
        headers,
        rows,
      });
    } catch (err) {
      alert(extractApiError(err, 'Could not export project data.'));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    const ok = await ask({
      title: `Delete "${project?.name}"?`,
      message: 'This is permanent and will also remove all logged time entries.',
      confirmLabel: 'Delete project',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteProject(projectId);
      navigate('/projects');
    } catch (err) {
      alert(extractApiError(err, 'Failed to delete project.'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
            Loading project…
          </div>
        </main>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-bg">
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
          <Link to="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
            {error || 'Project not found'}
          </div>
        </main>
      </div>
    );
  }

  const budgetAmount = Number.parseFloat(project.budget_amount ?? '0');
  const totalLogged = Number.parseFloat(project.total_hours_logged ?? '0');
  const billableLogged = Number.parseFloat(project.billable_hours_logged ?? '0');
  const nonBillableLogged = Number.parseFloat(project.non_billable_hours_logged ?? '0');
  const spent = totalLogged;
  const remaining = budgetAmount - spent;
  const pct = budgetAmount > 0 ? Math.min((spent / budgetAmount) * 100, 100) : 0;
  const hasBudget = project.budget_type !== 'none' && budgetAmount > 0;

  // Team utilization for the selected chart range:
  // = hours logged in window / (sum of member weekly capacities × weeks in window) × 100
  const teamUtilization = (() => {
    const { start, end } = computeRangeDates(chartRange, chartCustomStart, chartCustomEnd);
    if (!start || !end) return { pct: 0, capacity: 0, hasCapacity: false };
    const days =
      Math.max(
        1,
        Math.round(
          (new Date(`${end}T00:00:00`).getTime() -
            new Date(`${start}T00:00:00`).getTime()) /
            86_400_000,
        ) + 1,
      );
    const weeks = days / 7;
    const totalCapacity = project.memberships.reduce((sum, m) => {
      const cap = Number.parseFloat(m.user.weekly_capacity_hours ?? '0');
      return sum + (Number.isFinite(cap) ? cap : 0);
    }, 0);
    const windowCapacity = totalCapacity * weeks;
    if (windowCapacity <= 0) return { pct: 0, capacity: 0, hasCapacity: false };
    const raw = (chartWindowHours / windowCapacity) * 100;
    return { pct: raw, capacity: windowCapacity, hasCapacity: true };
  })();

  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link to="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <Link to={`/clients/${project.client_id}`} className="text-primary hover:underline">
                {project.client_name}
              </Link>
            </p>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 font-heading text-3xl font-bold text-text">
              <span className={!project.is_active ? 'text-muted' : ''}>{project.name}</span>
              {!project.is_active ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                  <Archive className="h-3 w-3" />
                  Archived
                </span>
              ) : null}
            </h1>
            {project.notes ? (
              <div className="mt-3 max-w-3xl text-sm text-muted">
                <p className={showFullNotes ? '' : 'line-clamp-2'}>{project.notes}</p>
                {project.notes.length > 140 ? (
                  <button
                    type="button"
                    onClick={() => setShowFullNotes((s) => !s)}
                    className="mt-1 text-primary hover:underline"
                  >
                    {showFullNotes ? 'Show less' : 'Show more'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              {!project.is_active ? (
                <button
                  type="button"
                  onClick={handleRestore}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent-dark/30 bg-accent-soft px-3.5 py-2 text-sm font-semibold text-accent-dark shadow-sm transition hover:bg-accent-soft/70"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore project
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="btn-outline"
              >
                <Pencil className="h-4 w-4" />
                Edit project
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActionsOpen((o) => !o)}
                  className="btn-outline"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  Actions
                </button>
                {actionsOpen ? (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} aria-hidden="true" />
                    <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
                      <button
                        type="button"
                        onClick={handleDuplicate}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-bg"
                      >
                        <Copy className="h-4 w-4" /> Duplicate project
                      </button>
                      <div className="border-t border-slate-100" />
                      {project.is_active ? (
                        <button
                          type="button"
                          onClick={handleArchive}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-warning transition hover:bg-warning/10"
                        >
                          <Archive className="h-4 w-4" /> Archive project
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 className="h-4 w-4" /> Delete project
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* KPI metrics row above, full-width chart below. Stacked layout gives the
            chart maximum width and lets numbers + chart breathe vertically. */}
        <div className="mb-6 grid grid-cols-1 gap-4">
        {/* Chart card */}
        <section className="card order-2 overflow-hidden p-0">
          {/* Header: eyebrow + title + subtitle on left, pill segmented control on right */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                {chartView === 'progress' ? (
                  <TrendingUp className="h-5 w-5" />
                ) : (
                  <BarChart3 className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  {chartView === 'progress' ? 'Cumulative burn' : 'Weekly cadence'}
                </p>
                <h2 className="mt-1 font-heading text-lg font-bold text-text">
                  {chartView === 'progress' ? 'Project progress' : 'Hours per week'}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {chartView === 'progress'
                    ? 'Cumulative hours logged over time, tracked against budget.'
                    : 'How many hours land on this project each week.'}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
              <select
                value={chartRange}
                onChange={(e) => setChartRange(e.target.value as RangeKey)}
                className="input w-full py-1.5 text-sm sm:w-auto"
                aria-label="Chart time range"
              >
                {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                  <option key={k} value={k}>
                    {RANGE_LABEL[k]}
                  </option>
                ))}
              </select>
              <div
                role="tablist"
                aria-label="Chart view"
                className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={chartView === 'progress'}
                  onClick={() => setChartView('progress')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    chartView === 'progress'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Progress
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={chartView === 'hours'}
                  onClick={() => setChartView('hours')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    chartView === 'hours'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Hours
                </button>
              </div>
            </div>
          </div>

          {/* Period summary chips — reflect the selected chart range. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-100 px-5 py-3 text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              <span className="font-semibold uppercase tracking-wider text-muted">
                {RANGE_LABEL[chartRange]} total
              </span>
              <span className="font-bold tabular-nums text-text">
                {chartLoading ? '…' : `${chartWindowHours.toFixed(2)} hr`}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              <span className="font-semibold uppercase tracking-wider text-muted">Billable</span>
              <span className="font-bold tabular-nums text-text">
                {chartLoading ? '…' : `${chartWindowBillable.toFixed(2)} hr`}
              </span>
            </span>
          </div>

          {/* Range header — mirrors the table's "Week: 11 – 17 May 2026" pattern.
              For 'custom' shows two date pickers. */}
          {chartRange === 'custom' ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-5 py-3">
              <h3 className="font-heading text-base font-bold text-text sm:text-lg">
                {RANGE_LABEL[chartRange]}:
              </h3>
              <input
                type="date"
                value={chartCustomStart}
                max={chartCustomEnd || undefined}
                onChange={(e) => setChartCustomStart(e.target.value)}
                className="input w-auto py-1.5 text-sm"
                aria-label="Custom start date"
              />
              <span className="text-sm font-medium text-muted">to</span>
              <input
                type="date"
                value={chartCustomEnd}
                min={chartCustomStart || undefined}
                onChange={(e) => setChartCustomEnd(e.target.value)}
                className="input w-auto py-1.5 text-sm"
                aria-label="Custom end date"
              />
              {chartCustomStart && chartCustomEnd ? (
                <span className="text-sm font-medium text-muted">
                  ({formatDateRangeLabel(chartCustomStart, chartCustomEnd)})
                </span>
              ) : null}
            </div>
          ) : chartRange !== 'all_time' ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 px-5 py-3">
              <h3 className="font-heading text-base font-bold text-text sm:text-lg">
                {RANGE_LABEL[chartRange]}:
              </h3>
              <span className="text-sm font-medium text-muted">
                {formatRangeHeader(chartRange)}
              </span>
            </div>
          ) : null}

          <div className="px-4 pb-4 pt-4 sm:px-5">
            <ProjectChart
              kind={chartView}
              budgetAmount={budgetAmount}
              hasBudget={hasBudget}
              windowHours={chartWindowHours}
              rangeLabel={RANGE_LABEL[chartRange]}
            />
          </div>
        </section>

        {/* KPI cards — horizontal 3-card strip at top. Stacks on mobile.
            `auto-rows-fr` keeps the three cards equal-height. */}
        <div className="order-1 grid grid-cols-1 gap-4 sm:auto-rows-fr sm:grid-cols-3">
          {(() => {
            const billablePct = totalLogged > 0 ? (billableLogged / totalLogged) * 100 : 0;
            return (
              <div className="card relative flex h-full flex-col overflow-hidden p-5 transition hover:shadow-lg">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-primary/40" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Total hours
                    </p>
                    <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-text">
                      {totalLogged.toFixed(2)}
                      <span className="ml-1 text-base font-medium text-muted">hr</span>
                    </p>
                  </div>
                  <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Clock className="h-5 w-5" />
                  </div>
                </div>
                {totalLogged > 0 ? (
                  <div className="mt-auto pt-4">
                    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="bg-accent transition-all"
                        style={{ width: `${billablePct}%` }}
                      />
                      <div
                        className="bg-slate-300 transition-all"
                        style={{ width: `${100 - billablePct}%` }}
                      />
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                        <span className="text-muted">Billable</span>
                        <span className="font-semibold tabular-nums text-text">
                          {billableLogged.toFixed(2)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden="true" />
                        <span className="text-muted">Non-billable</span>
                        <span className="font-semibold tabular-nums text-text">
                          {nonBillableLogged.toFixed(2)}
                        </span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-auto pt-3 text-xs text-muted">No hours logged yet.</p>
                )}
              </div>
            );
          })()}

          {(() => {
            const isOver = hasBudget && remaining < 0;
            const isWarn = hasBudget && !isOver && pct >= 80;
            const accentTone = isOver ? 'danger' : isWarn ? 'warning' : 'accent';
            const valueTone = isOver
              ? 'text-danger'
              : isWarn
                ? 'text-warning'
                : 'text-text';
            const iconBg = isOver
              ? 'bg-danger/10 text-danger'
              : isWarn
                ? 'bg-warning/10 text-warning'
                : 'bg-accent-soft text-accent-dark';
            const barColor = isOver
              ? 'bg-danger'
              : isWarn
                ? 'bg-warning'
                : 'bg-accent';
            const stripeGradient =
              accentTone === 'danger'
                ? 'from-danger to-danger/40'
                : accentTone === 'warning'
                  ? 'from-warning to-warning/40'
                  : 'from-accent to-accent/40';
            return (
              <div className="card relative flex h-full flex-col overflow-hidden p-5 transition hover:shadow-lg">
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stripeGradient}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Remaining hours {hasBudget ? `(${Math.max(0, Math.round(100 - pct))}%)` : ''}
                    </p>
                    <p
                      className={`mt-2 font-heading text-3xl font-bold tabular-nums ${valueTone}`}
                    >
                      {hasBudget
                        ? formatBudget(remaining.toFixed(2), project.budget_type)
                        : '—'}
                    </p>
                  </div>
                  <div
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
                  >
                    <Target className="h-5 w-5" />
                  </div>
                </div>
                {hasBudget ? (
                  <div className="mt-auto pt-4">
                    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`${barColor} transition-all`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="mt-2.5 text-xs text-muted">
                      {isOver ? 'Over budget by ' : ''}
                      <span className="font-semibold text-text">
                        {totalLogged.toFixed(2)} hr
                      </span>{' '}
                      / {formatBudget(project.budget_amount, project.budget_type)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-auto pt-3 text-xs text-muted">No budget set for this project.</p>
                )}
              </div>
            );
          })()}

          {(() => {
            const utilPct = teamUtilization.pct;
            const utilOver = utilPct > 100;
            const utilWarn = !utilOver && utilPct >= 80;
            const utilTone = utilOver
              ? 'text-danger'
              : utilWarn
                ? 'text-warning'
                : teamUtilization.hasCapacity
                  ? 'text-text'
                  : 'text-muted';
            const utilIconBg = utilOver
              ? 'bg-danger/10 text-danger'
              : utilWarn
                ? 'bg-warning/10 text-warning'
                : teamUtilization.hasCapacity
                  ? 'bg-primary-soft text-primary'
                  : 'bg-slate-100 text-muted';
            const utilBarColor = utilOver
              ? 'bg-danger'
              : utilWarn
                ? 'bg-warning'
                : 'bg-primary';
            const utilStripe = utilOver
              ? 'from-danger to-danger/40'
              : utilWarn
                ? 'from-warning to-warning/40'
                : teamUtilization.hasCapacity
                  ? 'from-primary to-primary/40'
                  : 'from-slate-300 to-slate-200';
            return (
              <div className="card relative flex h-full flex-col overflow-hidden p-5 transition hover:shadow-lg">
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${utilStripe}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Team utilization
                    </p>
                    <p className={`mt-2 font-heading text-3xl font-bold tabular-nums ${utilTone}`}>
                      {utilPct.toFixed(teamUtilization.hasCapacity ? 1 : 0)}
                      <span className="ml-0.5 text-base font-medium text-muted">%</span>
                    </p>
                  </div>
                  <div
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${utilIconBg}`}
                  >
                    <Users className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-auto pt-4">
                  <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`${utilBarColor} transition-all`}
                      style={{ width: `${Math.min(utilPct, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2.5 text-xs text-muted">
                    {teamUtilization.hasCapacity ? (
                      <>
                        <span className="font-semibold text-text">
                          {chartWindowHours.toFixed(2)} hr
                        </span>{' '}
                        / {teamUtilization.capacity.toFixed(0)} hr capacity ·{' '}
                        {RANGE_LABEL[chartRange]}
                      </>
                    ) : project.memberships.length === 0 ? (
                      'No team members assigned to this project.'
                    ) : (
                      'Set weekly capacity on team members to see utilization.'
                    )}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
        </div>

        {/* Tabs row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
          <div className="flex gap-1">
            {(['tasks', 'team'] as TabKey[]).map((key) => {
              const Icon = key === 'tasks' ? ListChecks : Users;
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold capitalize transition ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-text'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted'}`} />
                  {key}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 pb-2">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="input w-auto py-1.5 text-sm"
            >
              {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                <option key={k} value={k}>
                  {RANGE_LABEL[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="btn-outline py-1.5 text-sm"
              title="Export task & team breakdown as CSV"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>

        {/* Period range header — shows date range for fixed periods, date pickers for 'custom'. */}
        {range === 'custom' ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="font-heading text-base font-bold text-text sm:text-lg">
              {RANGE_LABEL[range]}:
            </h3>
            <input
              type="date"
              value={tableCustomStart}
              max={tableCustomEnd || undefined}
              onChange={(e) => setTableCustomStart(e.target.value)}
              className="input w-auto py-1.5 text-sm"
              aria-label="Custom start date"
            />
            <span className="text-sm font-medium text-muted">to</span>
            <input
              type="date"
              value={tableCustomEnd}
              min={tableCustomStart || undefined}
              onChange={(e) => setTableCustomEnd(e.target.value)}
              className="input w-auto py-1.5 text-sm"
              aria-label="Custom end date"
            />
            {tableCustomStart && tableCustomEnd ? (
              <span className="text-sm font-medium text-muted">
                ({formatDateRangeLabel(tableCustomStart, tableCustomEnd)})
              </span>
            ) : null}
          </div>
        ) : range !== 'all_time' ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="font-heading text-base font-bold text-text sm:text-lg">
              {RANGE_LABEL[range]}:
            </h3>
            <span className="text-sm font-medium text-muted">
              {formatRangeHeader(range)}
            </span>
          </div>
        ) : null}

        <div className="py-6">
          {tab === 'tasks' ? (
            <TasksPanel
              project={project}
              canEdit={canEdit}
              range={range}
              customStart={tableCustomStart}
              customEnd={tableCustomEnd}
              onChange={refreshProject}
            />
          ) : (
            <TeamPanel
              project={project}
              canEdit={canEdit}
              range={range}
              customStart={tableCustomStart}
              customEnd={tableCustomEnd}
              onChange={refreshProject}
            />
          )}
        </div>
      </main>

      {editOpen ? (
        <EditProjectModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setProject(updated);
            setEditOpen(false);
          }}
        />
      ) : null}

      {confirmDialog}
    </div>
  );
}

function EditProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectDetail;
  onClose: () => void;
  onSaved: (p: ProjectDetail) => void;
}) {
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code);
  const [startDate, setStartDate] = useState(project.start_date ?? '');
  const [endDate, setEndDate] = useState(project.end_date ?? '');
  const [notes, setNotes] = useState(project.notes);
  const [visibility, setVisibility] = useState<ProjectVisibility>(project.visibility);
  const [budgetType, setBudgetType] = useState<BudgetType>(project.budget_type);
  const [budgetAmount, setBudgetAmount] = useState(project.budget_amount ?? '');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const budgetNeedsAmount = budgetType !== 'none';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrMsg(null);
    try {
      const updated = await updateProject(project.id, {
        name: name.trim(),
        code: code.trim(),
        start_date: startDate || null,
        end_date: endDate || null,
        notes: notes.trim(),
        visibility,
        budget_type: budgetType,
        budget_amount: budgetType === 'none' ? null : budgetAmount || null,
      });
      onSaved(updated);
    } catch (err) {
      setErrMsg(extractApiError(err, 'Could not save project.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="font-heading text-lg font-bold text-text sm:text-xl">Edit project</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-1 gap-4 overflow-y-auto px-4 py-4 sm:grid-cols-2 sm:px-6 sm:py-5">
            <div className="sm:col-span-2">
              <label className="label">Project name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Project code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label">Budget</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <select
                  value={budgetType}
                  onChange={(e) => setBudgetType(e.target.value as BudgetType)}
                  className="input w-full sm:w-auto"
                >
                  <option value="none">No budget</option>
                  <option value="total_hours">Total project hours</option>
                  <option value="hours_per_task">Hours per task</option>
                </select>
                {budgetNeedsAmount ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={budgetAmount}
                      onChange={(e) => setBudgetAmount(e.target.value)}
                      className="input w-full sm:w-40"
                      placeholder="0.00"
                    />
                    <span className="flex-shrink-0 text-sm font-medium text-muted">hours</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="label">Permissions</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-text">
                  <input
                    type="radio"
                    name="visibility"
                    value="admins_and_managers"
                    checked={visibility === 'admins_and_managers'}
                    onChange={() => setVisibility('admins_and_managers')}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  Show to Administrators and project managers
                </label>
                <label className="flex items-start gap-2 text-sm text-text">
                  <input
                    type="radio"
                    name="visibility"
                    value="everyone"
                    checked={visibility === 'everyone'}
                    onChange={() => setVisibility('everyone')}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  Show to everyone on this project
                </label>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input resize-none"
              />
            </div>
          </div>

          {errMsg ? (
            <div className="mx-4 mb-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger sm:mx-6">
              {errMsg}
            </div>
          ) : null}

          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
            <button type="button" onClick={onClose} className="btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectChart({
  kind,
  budgetAmount,
  hasBudget,
  windowHours,
  rangeLabel,
}: {
  kind: ChartKey;
  budgetAmount: number;
  hasBudget: boolean;
  windowHours: number;
  rangeLabel: string;
}) {
  // Width/height in viewBox units — wider aspect to match the full-width container
  // (chart now sits in a stacked layout, not 2/3 column).
  // padL is sized to fit the widest y-label without clipping.
  const W = 1200;
  const H = 280;
  const padL = 80;
  const padR = 48;
  const padT = 36;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // X axis: 8 weeks with This week sitting in the middle
  const weeks = 8;
  const thisWeekIdx = 5;

  // Round up to a sensible upper bound so y-axis ticks land on clean numbers.
  const niceCeil = (raw: number): number => {
    if (raw <= 0) return 10;
    if (raw <= 5) return 5;
    if (raw <= 10) return 10;
    if (raw <= 20) return 20;
    if (raw <= 50) return 50;
    if (raw <= 100) return 100;
    if (raw <= 250) return 250;
    if (raw <= 500) return 500;
    if (raw <= 1000) return 1000;
    return Math.ceil(raw / 500) * 500;
  };

  // Y-axis scale derived from REAL data (budget + logged hours), not synthetic defaults.
  const yMaxRaw =
    kind === 'progress'
      ? Math.max(hasBudget ? budgetAmount * 1.1 : 0, windowHours * 1.3, 10)
      : Math.max(windowHours * 1.5, 10);
  const yMax = niceCeil(yMaxRaw);
  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => (yMax / ticks) * i);

  const seriesMax = yMax;
  const yScale = (v: number) => padT + innerH - (v / seriesMax) * innerH;
  const xScale = (i: number) => padL + (innerW * i) / (weeks - 1);

  // Both views plot the hours logged in the selected window — keeps the chart in sync
  // with the period summary chips and team utilization card.
  const currentValue = windowHours;
  const hasValue = currentValue > 0;

  const fmtY = (v: number) => `${Math.round(v)}h`;
  const fmtValue = (v: number) => `${v.toFixed(2)} hr`;

  // x-axis labels: This week sits in the middle
  const today = new Date();
  const weekLabel = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + (offset - thisWeekIdx) * 7);
    return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
  };

  // Show 3 month labels evenly
  const xLabels = [
    { i: 1, label: weekLabel(1) },
    { i: 4, label: weekLabel(4) },
    { i: 7, label: weekLabel(7) },
  ];

  return (
    <div className="w-full overflow-x-auto sm:overflow-x-visible">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-80 w-[680px] sm:w-full"
      >
        {/* gridlines + y labels */}
        {tickValues.map((v, i) => {
          const y = padT + innerH - (v / seriesMax) * innerH;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth={1}
              />
              <text
                x={padL - 10}
                y={y + 5}
                textAnchor="end"
                className="fill-text/80"
                fontSize={16}
                fontWeight={500}
              >
                {fmtY(v)}
              </text>
            </g>
          );
        })}

        {/* "This week" position marker — just a dashed vertical line + label.
            No filled band, to avoid being mistaken for a data bar. */}
        <line
          x1={xScale(thisWeekIdx)}
          x2={xScale(thisWeekIdx)}
          y1={padT}
          y2={padT + innerH}
          stroke="#0052CC"
          strokeWidth={1.5}
          strokeDasharray="4 5"
          opacity={0.55}
        />
        <text
          x={xScale(thisWeekIdx)}
          y={padT - 10}
          textAnchor="middle"
          className="fill-primary"
          fontSize={15}
          fontWeight={700}
        >
          {rangeLabel}
        </text>

        {/* Budget label (progress mode) */}
        {kind === 'progress' && hasBudget ? (
          <g>
            <line
              x1={padL}
              x2={W - padR}
              y1={yScale(budgetAmount)}
              y2={yScale(budgetAmount)}
              stroke="#172B4D"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <rect
              x={padL + 6}
              y={yScale(budgetAmount) - 26}
              width={160}
              height={26}
              rx={4}
              fill="#172B4D"
            />
            <text
              x={padL + 16}
              y={yScale(budgetAmount) - 8}
              fill="#fff"
              fontSize={15}
              fontWeight={700}
            >
              Budget: {fmtY(budgetAmount)}
            </text>
          </g>
        ) : null}

        {/* Real data — single point at the current week. Other weeks are blank
            because we don't have historical weekly aggregates yet. */}
        {hasValue && kind === 'progress' ? (
          <g>
            <circle
              cx={xScale(thisWeekIdx)}
              cy={yScale(currentValue)}
              r={7}
              fill="#0052CC"
              stroke="#fff"
              strokeWidth={2.5}
            />
            <rect
              x={xScale(thisWeekIdx) - 50}
              y={yScale(currentValue) - 38}
              width={100}
              height={26}
              rx={4}
              fill="#172B4D"
            />
            <text
              x={xScale(thisWeekIdx)}
              y={yScale(currentValue) - 20}
              textAnchor="middle"
              fill="#fff"
              fontSize={15}
              fontWeight={700}
            >
              {fmtValue(currentValue)}
            </text>
          </g>
        ) : null}

        {hasValue && kind === 'hours' ? (() => {
          const barW = innerW / (weeks * 1.6);
          const x = xScale(thisWeekIdx) - barW / 2;
          const y = yScale(currentValue);
          return (
            <g>
              <rect
                x={x}
                y={y}
                width={barW}
                height={padT + innerH - y}
                fill="#0052CC"
                rx={3}
              />
              <text
                x={xScale(thisWeekIdx)}
                y={y - 10}
                textAnchor="middle"
                className="fill-text"
                fontSize={15}
                fontWeight={700}
              >
                {fmtValue(currentValue)}
              </text>
            </g>
          );
        })() : null}

        {/* Empty state — when no hours logged yet */}
        {!hasValue ? (
          <text
            x={padL + innerW / 2}
            y={padT + innerH / 2}
            textAnchor="middle"
            className="fill-muted"
            fontSize={18}
            fontWeight={500}
          >
            No hours logged yet
          </text>
        ) : null}

        {/* x-axis labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={xScale(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-text/80"
            fontSize={17}
            fontWeight={500}
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}


function TasksPanel({
  project,
  canEdit,
  range,
  customStart,
  customEnd,
  onChange,
}: {
  project: ProjectDetail;
  canEdit: boolean;
  range: RangeKey;
  customStart?: string;
  customEnd?: string;
  onChange: () => void;
}) {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [adding, setAdding] = useState<number | ''>('');
  const [breakdown, setBreakdown] = useState<TaskBreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    listTasks({ is_active: true }).then((r) => setAllTasks(r.results));
  }, []);

  // Pull task→members breakdown from the Time report API (with cost included).
  useEffect(() => {
    let cancelled = false;
    setBreakdownLoading(true);
    const { start, end } = computeRangeDates(range, customStart, customEnd);
    getTimeReport({ project_id: project.id, start, end })
      .then((data) => {
        if (!cancelled) setBreakdown(data.task_breakdown ?? []);
      })
      .catch(() => {
        if (!cancelled) setBreakdown([]);
      })
      .finally(() => {
        if (!cancelled) setBreakdownLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch when the project's task list changes (so newly added/removed tasks appear).
  }, [project.id, project.project_tasks.length, range, customStart, customEnd]);

  const breakdownById = useMemo(() => {
    const map = new Map<number, TaskBreakdownRow>();
    breakdown.forEach((b) => map.set(b.id, b));
    return map;
  }, [breakdown]);

  const breakdownByName = useMemo(() => {
    const map = new Map<string, TaskBreakdownRow>();
    breakdown.forEach((b) => map.set(b.name, b));
    return map;
  }, [breakdown]);

  const assignedIds = useMemo(
    () => new Set(project.project_tasks.map((pt) => pt.task_id)),
    [project.project_tasks],
  );
  const available = allTasks.filter((t) => !assignedIds.has(t.id));

  const handleAdd = async () => {
    if (!adding) return;
    const sourceTask = allTasks.find((t) => t.id === adding);
    await addProjectTask(project.id, {
      task_id: adding,
      is_billable: sourceTask?.default_is_billable ?? true,
    });
    setAdding('');
    onChange();
  };

  const handleRemove = async (taskId: number) => {
    await removeProjectTask(project.id, taskId);
    onChange();
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build a unified row list — every project_task gets a row, with breakdown
  // data merged in when present.
  type Row = {
    projectTaskId: number;
    taskId?: number;
    name: string;
    isBillable: boolean;
    hours: number;
    billableAmount: number;
    cost: number;
    members: TaskBreakdownRow['members'];
  };
  const rows: Row[] = project.project_tasks.map((pt) => {
    const bd =
      (pt.task_id !== undefined ? breakdownById.get(pt.task_id) : undefined) ??
      breakdownByName.get(pt.task_name);
    // Trust the date-filtered breakdown once it has loaded. While loading we
    // show the all-time hours as a placeholder; after the response arrives,
    // an absent task means "no hours in this window" (not "fall back to lifetime").
    const hoursRaw = bd
      ? bd.hours
      : breakdownLoading
        ? (pt.hours_logged ?? '0')
        : '0';
    return {
      projectTaskId: pt.id,
      taskId: pt.task_id ?? bd?.id,
      name: pt.task_name,
      isBillable: pt.is_billable,
      hours: Number.parseFloat(hoursRaw) || 0,
      billableAmount: Number.parseFloat(bd?.billable_amount ?? '0') || 0,
      cost: Number.parseFloat(bd?.cost ?? '0') || 0,
      members: bd?.members ?? [],
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      hours: acc.hours + r.hours,
      billableAmount: acc.billableAmount + r.billableAmount,
      cost: acc.cost + r.cost,
    }),
    { hours: 0, billableAmount: 0, cost: 0 },
  );

  const billableRows = rows.filter((r) => r.isBillable);
  const nonBillableRows = rows.filter((r) => !r.isBillable);

  const renderTaskRow = (row: Row) => {
    const isOpen = expanded.has(row.projectTaskId);
    const canExpand = row.hours > 0 || row.members.length > 0;
    const detailedHref = row.taskId
      ? `/reports/detailed-time?project_id=${project.id}&task_id=${row.taskId}`
      : `/reports/detailed-time?project_id=${project.id}`;
    return (
      <Fragment key={row.projectTaskId}>
        <tr
          className={`border-b border-slate-100 ${
            isOpen ? 'bg-primary-soft/30' : 'hover:bg-slate-50/70'
          }`}
        >
          <td className="px-3 py-3">
            {canExpand ? (
              <button
                type="button"
                onClick={() => toggleExpand(row.projectTaskId)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-slate-100 hover:text-text"
                aria-label={isOpen ? 'Collapse' : 'Expand'}
              >
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
              </button>
            ) : null}
          </td>
          <td className="px-4 py-3">
            <span className="flex items-center gap-2.5">
              <span
                className={`inline-block h-3 w-3 rounded-sm ${row.isBillable ? 'bg-accent' : 'bg-slate-300'}`}
              />
              <span className="font-semibold text-text">{row.name}</span>
            </span>
          </td>
          <td className="px-4 py-3 text-right tabular-nums">
            <Link
              to={detailedHref}
              className="font-semibold text-primary hover:underline"
            >
              {row.hours.toFixed(2)}
            </Link>
          </td>
          <td className="px-4 py-3 text-right font-semibold tabular-nums text-text">
            {row.isBillable ? formatCurrency(row.billableAmount) : <span className="text-muted">—</span>}
          </td>
          <td className="px-4 py-3 text-right tabular-nums text-text">
            {formatCurrency(row.cost)}
          </td>
          <td className="px-4 py-3 text-right">
            {canEdit && row.taskId ? (
              <button
                type="button"
                onClick={() => handleRemove(row.taskId!)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                title="Remove task"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </td>
        </tr>
        {isOpen && row.members.length === 0 ? (
          <tr className="border-b border-slate-100 bg-slate-50/40">
            <td className="px-3 py-2.5" />
            <td colSpan={5} className="px-4 py-2.5 pl-10 text-xs italic text-muted">
              {breakdownLoading
                ? 'Loading team breakdown…'
                : 'No team breakdown available for this task yet.'}
            </td>
          </tr>
        ) : null}
        {isOpen
          ? row.members.map((m) => (
              <tr
                key={`${row.projectTaskId}-${m.user_id}`}
                className="border-b border-slate-100 bg-slate-50/40"
              >
                <td className="px-3 py-2.5" />
                <td className="px-4 py-2.5 pl-10">
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                      {m.initials}
                    </span>
                    <span className="font-medium text-text">{m.name}</span>
                    {m.role ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                        {m.role}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <Link
                    to={
                      row.taskId
                        ? `/reports/detailed-time?project_id=${project.id}&task_id=${row.taskId}&user_id=${m.user_id}`
                        : `/reports/detailed-time?project_id=${project.id}&user_id=${m.user_id}`
                    }
                    className="font-semibold text-primary hover:underline"
                  >
                    {Number.parseFloat(m.hours).toFixed(2)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text">
                  {row.isBillable ? (
                    formatCurrency(m.billable_amount || '0')
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text">
                  {formatCurrency(m.cost || '0')}
                </td>
                <td className="px-4 py-2.5" />
              </tr>
            ))
          : null}
      </Fragment>
    );
  };

  const sectionHeader = (label: string, tone: 'billable' | 'nonBillable') => {
    const dot = tone === 'billable' ? 'bg-accent' : 'bg-slate-400';
    const text = tone === 'billable' ? 'text-accent-dark' : 'text-slate-500';
    return (
      <tr className="border-b border-slate-100">
        <td colSpan={6} className="px-4 pb-2 pt-4">
          <span className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
            <span className={`text-xs font-bold uppercase tracking-[0.1em] ${text}`}>
              {label}
            </span>
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
              <th className="w-10 px-3 py-3" />
              <th className="px-4 py-3">Task</th>
              <th className="px-4 py-3 text-right">Hours</th>
              <th className="px-4 py-3 text-right">Billable amount</th>
              <th className="px-4 py-3 text-right">Costs</th>
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {breakdownLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted">
                  No tasks assigned yet.
                </td>
              </tr>
            ) : (
              <>
                {billableRows.length > 0 ? (
                  <>
                    {sectionHeader('Billable tasks', 'billable')}
                    {billableRows.map(renderTaskRow)}
                  </>
                ) : null}
                {nonBillableRows.length > 0 ? (
                  <>
                    {sectionHeader('Non-billable tasks', 'nonBillable')}
                    {nonBillableRows.map(renderTaskRow)}
                  </>
                ) : null}
              </>
            )}
            {rows.length > 0 ? (
              <tr className="border-t-2 border-primary/20 bg-primary-soft/30 font-bold">
                <td className="px-3 py-3" />
                <td className="px-4 py-3 text-text">Total</td>
                <td className="px-4 py-3 text-right tabular-nums text-text">
                  {totals.hours.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text">
                  {formatCurrency(totals.billableAmount)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text">
                  {formatCurrency(totals.cost)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/50 px-4 py-3 sm:px-6">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value ? Number.parseInt(e.target.value, 10) : '')}
            className="input min-w-0 flex-1"
          >
            <option value="">Add a task…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleAdd} disabled={!adding} className="btn-primary">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TeamPanel({
  project,
  canEdit,
  range,
  customStart,
  customEnd,
  onChange,
}: {
  project: ProjectDetail;
  canEdit: boolean;
  range: RangeKey;
  customStart?: string;
  customEnd?: string;
  onChange: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [adding, setAdding] = useState<number | ''>('');
  const [breakdown, setBreakdown] = useState<TeamBreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const currencySymbol = useCurrencySymbol();

  useEffect(() => {
    listUsers().then(setUsers);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBreakdownLoading(true);
    const { start, end } = computeRangeDates(range, customStart, customEnd);
    getTimeReport({ project_id: project.id, start, end })
      .then((data) => {
        if (!cancelled) setBreakdown(data.team_breakdown ?? []);
      })
      .catch(() => {
        if (!cancelled) setBreakdown([]);
      })
      .finally(() => {
        if (!cancelled) setBreakdownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, project.memberships.length, range, customStart, customEnd]);

  const breakdownByUserId = useMemo(() => {
    const map = new Map<number, TeamBreakdownRow>();
    breakdown.forEach((b) => map.set(b.id, b));
    return map;
  }, [breakdown]);

  const assignedUserIds = useMemo(
    () => new Set(project.memberships.map((m) => m.user.id)),
    [project.memberships],
  );
  const available = users.filter((u) => !assignedUserIds.has(u.id));

  const handleAdd = async () => {
    if (!adding) return;
    await addProjectMember(project.id, { user_id: adding, is_project_manager: false });
    setAdding('');
    onChange();
  };

  const handleRemove = async (userId: number) => {
    await removeProjectMember(project.id, userId);
    onChange();
  };

  const handleToggleManager = async (userId: number, isManager: boolean) => {
    const membership = project.memberships.find((m) => m.user.id === userId);
    await addProjectMember(project.id, {
      user_id: userId,
      hourly_rate: membership?.hourly_rate ?? null,
      is_project_manager: isManager,
    });
    onChange();
  };

  const toggleExpand = (userId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Build unified rows from project memberships, merging breakdown data when present.
  type Row = {
    membershipId: number;
    userId: number;
    name: string;
    email: string;
    role: string;
    isProjectManager: boolean;
    hourlyRate: string;
    hours: number;
    billableAmount: number;
    cost: number;
    tasks: TeamBreakdownRow['tasks'];
  };
  const hasAnyBreakdown = breakdown.length > 0;
  const rows: Row[] = project.memberships.map((m) => {
    const bd = breakdownByUserId.get(m.user.id);
    const hoursRaw = bd
      ? bd.hours
      : hasAnyBreakdown
        ? '0'
        : (m.hours_logged ?? '0');
    return {
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.full_name,
      email: m.user.email,
      role: m.user.role,
      isProjectManager: m.is_project_manager,
      hourlyRate: m.hourly_rate ?? '',
      hours: Number.parseFloat(hoursRaw) || 0,
      billableAmount: Number.parseFloat(bd?.billable_amount ?? '0') || 0,
      cost: Number.parseFloat(bd?.cost ?? '0') || 0,
      tasks: bd?.tasks ?? [],
    };
  });

  const handleSaveRate = async (userId: number, rate: string) => {
    const membership = project.memberships.find((m) => m.user.id === userId);
    await addProjectMember(project.id, {
      user_id: userId,
      hourly_rate: rate.trim() === '' ? null : rate.trim(),
      is_project_manager: membership?.is_project_manager ?? false,
    });
    onChange();
  };

  const totals = rows.reduce(
    (acc, r) => ({
      hours: acc.hours + r.hours,
      billableAmount: acc.billableAmount + r.billableAmount,
      cost: acc.cost + r.cost,
    }),
    { hours: 0, billableAmount: 0, cost: 0 },
  );

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
              <th className="w-10 px-3 py-3" />
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Hours</th>
              {project.billable_rate_strategy === 'person' ? (
                <th className="px-4 py-3 text-right">Rate (per hr)</th>
              ) : null}
              <th className="px-4 py-3 text-right">Billable amount</th>
              <th className="px-4 py-3 text-right">Costs</th>
              <th className="px-4 py-3 text-center">Manages</th>
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={project.billable_rate_strategy === 'person' ? 8 : 7}
                  className="px-6 py-10 text-center text-sm text-muted"
                >
                  No team members yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isOpen = expanded.has(row.userId);
                const canExpand = row.hours > 0 || row.tasks.length > 0;
                const detailedHref = `/reports/detailed-time?project_id=${project.id}&user_id=${row.userId}`;
                return (
                  <Fragment key={row.membershipId}>
                    <tr
                      className={`border-b border-slate-100 ${
                        isOpen ? 'bg-primary-soft/30' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="px-3 py-3">
                        {canExpand ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(row.userId)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-slate-100 hover:text-text"
                            aria-label={isOpen ? 'Collapse' : 'Expand'}
                          >
                            <ChevronRight
                              className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            />
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-text">{row.name}</p>
                          <p className="text-xs text-muted">
                            {row.email} · {row.role}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <Link
                          to={detailedHref}
                          className="font-semibold text-primary hover:underline"
                        >
                          {row.hours.toFixed(2)}
                        </Link>
                      </td>
                      {project.billable_rate_strategy === 'person' ? (
                        <td className="px-4 py-3 text-right">
                          <div className="relative ml-auto w-24">
                            <span
                              className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted ${
                                !canEdit ? 'opacity-40' : ''
                              }`}
                            >
                              {currencySymbol}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              defaultValue={row.hourlyRate}
                              disabled={!canEdit}
                              onBlur={(e) => {
                                const next = e.target.value;
                                if (next !== row.hourlyRate) {
                                  handleSaveRate(row.userId, next);
                                }
                              }}
                              placeholder="0.00"
                              className="input w-full py-1 pl-6 text-right text-sm tabular-nums disabled:opacity-40"
                              aria-label={`Hourly rate for ${row.name}`}
                            />
                          </div>
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-text">
                        {formatCurrency(row.billableAmount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text">
                        {formatCurrency(row.cost)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={row.isProjectManager}
                          disabled={!canEdit}
                          onChange={(e) => handleToggleManager(row.userId, e.target.checked)}
                          className="h-4 w-4 accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => handleRemove(row.userId)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                            title="Remove member"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {isOpen && row.tasks.length === 0 ? (
                      <tr className="border-b border-slate-100 bg-slate-50/40">
                        <td className="px-3 py-2.5" />
                        <td
                          colSpan={project.billable_rate_strategy === 'person' ? 7 : 6}
                          className="px-4 py-2.5 pl-10 text-xs italic text-muted"
                        >
                          {breakdownLoading
                            ? 'Loading task breakdown…'
                            : 'No task breakdown available for this member yet.'}
                        </td>
                      </tr>
                    ) : null}
                    {isOpen
                      ? row.tasks.map((t) => (
                          <tr
                            key={`${row.userId}-${t.task_id}`}
                            className="border-b border-slate-100 bg-slate-50/40"
                          >
                            <td className="px-3 py-2.5" />
                            <td className="px-4 py-2.5 pl-10">
                              <span className="flex items-center gap-2.5">
                                <span className="inline-block h-3 w-3 rounded-sm bg-accent" />
                                <span className="font-medium text-text">{t.name}</span>
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              <Link
                                to={`/reports/detailed-time?project_id=${project.id}&user_id=${row.userId}&task_id=${t.task_id}`}
                                className="font-semibold text-primary hover:underline"
                              >
                                {Number.parseFloat(t.hours).toFixed(2)}
                              </Link>
                            </td>
                            {project.billable_rate_strategy === 'person' ? (
                              <td className="px-4 py-2.5" />
                            ) : null}
                            <td className="px-4 py-2.5 text-right tabular-nums text-text">
                              {formatCurrency(t.billable_amount || '0')}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-text">
                              {formatCurrency(t.cost || '0')}
                            </td>
                            <td className="px-4 py-2.5" />
                            <td className="px-4 py-2.5" />
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })
            )}
            {rows.length > 0 ? (
              <tr className="border-t-2 border-primary/20 bg-primary-soft/30 font-bold">
                <td className="px-3 py-3" />
                <td className="px-4 py-3 text-text">Total</td>
                <td className="px-4 py-3 text-right tabular-nums text-text">
                  {totals.hours.toFixed(2)}
                </td>
                {project.billable_rate_strategy === 'person' ? (
                  <td className="px-4 py-3" />
                ) : null}
                <td className="px-4 py-3 text-right tabular-nums text-text">
                  {formatCurrency(totals.billableAmount)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text">
                  {formatCurrency(totals.cost)}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/50 px-4 py-3 sm:px-6">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value ? Number.parseInt(e.target.value, 10) : '')}
            className="input min-w-0 flex-1"
          >
            <option value="">Assign a person…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
          <button type="button" onClick={handleAdd} disabled={!adding} className="btn-primary">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
