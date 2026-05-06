import {
  Archive,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Copy,
  Download,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TrendingUp,
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
import { getTimeReport, type TaskBreakdownRow } from '@/api/reports';
import { listUsers } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import { formatBudget } from '@/utils/format';
import type { BudgetType, ProjectDetail, ProjectVisibility, Task, User } from '@/types';

type TabKey = 'tasks' | 'team';
type ChartKey = 'progress' | 'hours';
type RangeKey = 'this_week' | 'this_month' | 'this_quarter' | 'all_time';

const RANGE_LABEL: Record<RangeKey, string> = {
  this_week: 'This week',
  this_month: 'This month',
  this_quarter: 'This quarter',
  all_time: 'All time',
};

export default function ProjectDetailPage() {
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
  const [showFullNotes, setShowFullNotes] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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
  const hoursThisWeek = Number.parseFloat(project.hours_this_week ?? '0');
  const avgHoursPerWeek = Number.parseFloat(project.avg_hours_per_week ?? '0');
  const spent = totalLogged;
  const remaining = budgetAmount - spent;
  const pct = budgetAmount > 0 ? Math.min((spent / budgetAmount) * 100, 100) : 0;
  const hasBudget = project.budget_type !== 'none' && budgetAmount > 0;

  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link to="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
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

        {/* Chart card */}
        <section className="card mb-6 overflow-hidden p-0">
          {/* Header: eyebrow + title + subtitle on left, pill segmented control on right */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-4">
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

            <div
              role="tablist"
              aria-label="Chart view"
              className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={chartView === 'progress'}
                onClick={() => setChartView('progress')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  chartView === 'progress'
                    ? 'bg-white text-primary shadow-sm ring-1 ring-primary/15'
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
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  chartView === 'hours'
                    ? 'bg-white text-primary shadow-sm ring-1 ring-primary/15'
                    : 'text-muted hover:text-text'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Hours
              </button>
            </div>
          </div>

          {/* KPI chip strip */}
          <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
            <ChartKpi
              dotColor="bg-primary"
              label="This week"
              value={`${hoursThisWeek.toFixed(2)} hr`}
              hint="logged so far"
            />
            <ChartKpi
              dotColor="bg-accent"
              label="Avg / week"
              value={`${avgHoursPerWeek.toFixed(2)} hr`}
              hint="across recent weeks"
            />
          </div>

          <div className="px-2 pb-3 pt-3">
            <ProjectChart
              kind={chartView}
              budgetAmount={budgetAmount}
              hasBudget={hasBudget}
            />
          </div>
        </section>

        {/* Metrics — hours-focused, no $ */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card">
            <p className="text-xs font-medium text-muted">Total hours</p>
            <p className="mt-2 font-heading text-2xl font-bold text-text">
              {totalLogged.toFixed(2)} hr
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>Billable</span>
              <span className="tabular-nums text-text">{billableLogged.toFixed(2)} hr</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Non-billable</span>
              <span className="tabular-nums text-text">{nonBillableLogged.toFixed(2)} hr</span>
            </div>
          </div>
          <div className="card">
            <p className="text-xs font-medium text-muted">
              Remaining hours {hasBudget ? `(${Math.round(100 - pct)}%)` : ''}
            </p>
            <p className="mt-2 font-heading text-2xl font-bold text-text">
              {hasBudget ? formatBudget(remaining.toFixed(2), project.budget_type) : '—'}
            </p>
            {hasBudget ? (
              <>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  Total budget {formatBudget(project.budget_amount, project.budget_type)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted">No budget set</p>
            )}
          </div>
          <div className="card">
            <p className="text-xs font-medium text-muted">Team utilization</p>
            <p className="mt-2 font-heading text-2xl font-bold text-text">—</p>
            <p className="mt-2 text-xs text-muted">
              % of team capacity logged on this project. Lights up when time entries are wired in.
            </p>
          </div>
        </section>

        {/* Tabs row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
          <div className="flex gap-6">
            {(['tasks', 'team'] as TabKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-1 py-3 text-sm font-semibold capitalize transition ${
                  tab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pb-2">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="input py-1.5 text-sm"
            >
              {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                <option key={k} value={k}>
                  {RANGE_LABEL[k]}
                </option>
              ))}
            </select>
            <button type="button" className="btn-outline py-1.5 text-sm" disabled title="Coming soon">
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <div className="py-6">
          {tab === 'tasks' ? (
            <TasksPanel project={project} canEdit={canEdit} onChange={refreshProject} />
          ) : (
            <TeamPanel project={project} canEdit={canEdit} onChange={refreshProject} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">Edit project</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
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
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={budgetType}
                  onChange={(e) => setBudgetType(e.target.value as BudgetType)}
                  className="input"
                >
                  <option value="none">No budget</option>
                  <option value="total_hours">Total project hours</option>
                  <option value="hours_per_task">Hours per task</option>
                </select>
                {budgetNeedsAmount ? (
                  <>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={budgetAmount}
                      onChange={(e) => setBudgetAmount(e.target.value)}
                      className="input w-40"
                      placeholder="0.00"
                    />
                    <span className="text-sm font-medium text-muted">hours</span>
                  </>
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
            <div className="mx-6 mb-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {errMsg}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
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

function ChartKpi({
  dotColor,
  label,
  value,
  hint,
}: {
  dotColor: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-white px-5 py-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      </div>
      <p className="mt-1 font-heading text-lg font-bold tabular-nums text-text">{value}</p>
      <p className="text-[11px] text-muted">{hint}</p>
    </div>
  );
}

function ProjectChart({
  kind,
  budgetAmount,
  hasBudget,
}: {
  kind: ChartKey;
  budgetAmount: number;
  hasBudget: boolean;
}) {
  // Width/height in viewBox units
  const W = 900;
  const H = 280;
  const padL = 60;
  const padR = 24;
  const padT = 30;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Determine y-axis scale
  const yMax = hasBudget && budgetAmount > 0 ? budgetAmount * 1.1 : kind === 'progress' ? 20000 : 40;
  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => (yMax / ticks) * i);

  // X axis: 8 weeks
  const weeks = 8;
  const thisWeekIdx = 5;

  // Sample data — until Epic 2 wires real time entries.
  const progressSeries = Array.from({ length: weeks }, (_, i) =>
    Math.min(yMax * 0.95, (yMax * 0.92 * (i + 1)) / weeks),
  );
  const hoursSeries = [4, 8, 12, 14, 18, 22, 26, 28];

  const series = kind === 'progress' ? progressSeries : hoursSeries;
  const seriesMax = kind === 'progress' ? yMax : Math.max(...hoursSeries) * 1.2;
  const yScale = (v: number) => padT + innerH - (v / seriesMax) * innerH;
  const xScale = (i: number) => padL + (innerW * i) / (weeks - 1);

  const pathD = series
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`)
    .join(' ');

  const fmtY = (v: number) => `${Math.round(v)}h`;

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
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-72 w-full">
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
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-muted"
                fontSize={11}
              >
                {fmtY(v)}
              </text>
            </g>
          );
        })}

        {/* This week highlight band */}
        <rect
          x={xScale(thisWeekIdx) - 30}
          y={padT}
          width={60}
          height={innerH}
          fill="#DEEBFF"
          opacity={0.6}
        />
        <text
          x={xScale(thisWeekIdx)}
          y={padT - 8}
          textAnchor="middle"
          className="fill-primary"
          fontSize={11}
          fontWeight={600}
        >
          This week
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
              y={yScale(budgetAmount) - 18}
              width={110}
              height={18}
              rx={4}
              fill="#172B4D"
            />
            <text
              x={padL + 12}
              y={yScale(budgetAmount) - 5}
              fill="#fff"
              fontSize={11}
              fontWeight={600}
            >
              Budget: {fmtY(budgetAmount)}
            </text>
          </g>
        ) : null}

        {/* Series line */}
        {kind === 'progress' ? (
          <path d={pathD} fill="none" stroke="#172B4D" strokeWidth={2} />
        ) : (
          // bar series for hours
          series.map((v, i) => {
            const barW = innerW / (weeks * 1.6);
            const x = xScale(i) - barW / 2;
            const y = yScale(v);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={padT + innerH - y}
                fill={i === thisWeekIdx ? '#0052CC' : '#5CDCA5'}
                rx={3}
              />
            );
          })
        )}

        {/* Series points */}
        {kind === 'progress'
          ? series.map((v, i) => (
              <circle
                key={i}
                cx={xScale(i)}
                cy={yScale(v)}
                r={3.5}
                fill="#172B4D"
              />
            ))
          : null}

        {/* x-axis labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={xScale(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted"
            fontSize={11}
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
  onChange,
}: {
  project: ProjectDetail;
  canEdit: boolean;
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
    getTimeReport({ project_id: project.id })
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
  }, [project.id, project.project_tasks.length]);

  const breakdownByName = useMemo(() => {
    const map = new Map<string, TaskBreakdownRow>();
    breakdown.forEach((b) => map.set(b.name, b));
    return map;
  }, [breakdown]);

  const assignedIds = useMemo(
    () => new Set(project.project_tasks.map((pt) => allTasks.find((t) => t.name === pt.task_name)?.id).filter(Boolean) as number[]),
    [project.project_tasks, allTasks],
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
    const tid = allTasks.find((t) => t.name === pt.task_name)?.id;
    const bd = breakdownByName.get(pt.task_name);
    return {
      projectTaskId: pt.id,
      taskId: tid,
      name: pt.task_name,
      isBillable: pt.is_billable,
      hours: Number.parseFloat(bd?.hours ?? pt.hours_logged ?? '0') || 0,
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

  return (
    <div className="card p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-4 py-2.5">Billable tasks</th>
              <th className="px-4 py-2.5 text-right">Hours</th>
              <th className="px-4 py-2.5 text-right">Billable amount</th>
              <th className="px-4 py-2.5 text-right">Costs</th>
              <th className="px-4 py-2.5 text-center">Billable</th>
              <th className="w-12 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {breakdownLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-muted">
                  No tasks assigned yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isOpen = expanded.has(row.projectTaskId);
                const hasMembers = row.members.length > 0;
                const detailedHref = row.taskId
                  ? `/reports/detailed-time?project_id=${project.id}&task_id=${row.taskId}`
                  : `/reports/detailed-time?project_id=${project.id}`;
                return (
                  <Fragment key={row.projectTaskId}>
                    <tr
                      className={`border-b border-slate-100 ${
                        isOpen ? 'bg-primary-soft/30' : 'hover:bg-bg/60'
                      }`}
                    >
                      <td className="px-3 py-3">
                        {hasMembers ? (
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
                          <span className="inline-block h-3 w-3 rounded-sm bg-accent" />
                          <span className="font-semibold text-text">{row.name}</span>
                          {!row.isBillable ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                              Non-billable
                            </span>
                          ) : null}
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
                        ${row.billableAmount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text">
                        ${row.cost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.isBillable ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-dark">
                            Billable
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
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
                    {isOpen
                      ? row.members.map((m) => (
                          <tr
                            key={`${row.projectTaskId}-${m.user_id}`}
                            className="border-b border-slate-50 bg-bg/30"
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
                              ${Number.parseFloat(m.billable_amount || '0').toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-text">
                              ${Number.parseFloat(m.cost || '0').toFixed(2)}
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
              <tr className="bg-bg/40 font-semibold">
                <td className="px-3 py-3" />
                <td className="px-4 py-3 text-text">Total</td>
                <td className="px-4 py-3 text-right tabular-nums text-text">
                  {totals.hours.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text">
                  ${totals.billableAmount.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text">
                  ${totals.cost.toFixed(2)}
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
            <option value="">Add a task…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleAdd} disabled={!adding} className="btn-primary">
            <Plus className="mr-1 h-4 w-4" />
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
  onChange,
}: {
  project: ProjectDetail;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [adding, setAdding] = useState<number | ''>('');

  useEffect(() => {
    listUsers().then(setUsers);
  }, []);

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

  return (
    <div className="card p-0">
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
      <div className="grid grid-cols-[1.5fr_120px_120px_80px] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <div>Name</div>
        <div className="text-right">Hours</div>
        <div className="text-center">Manages</div>
        <div className="text-right">Action</div>
      </div>
      {project.memberships.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-muted">No team members yet.</div>
      ) : (
        project.memberships.map((m) => (
          <MemberRow
            key={m.id}
            membership={m}
            canEdit={canEdit}
            onToggleManager={(isManager) => handleToggleManager(m.user.id, isManager)}
            onRemove={() => handleRemove(m.user.id)}
          />
        ))
      )}
        </div>
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
            <Plus className="mr-1 h-4 w-4" />
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MemberRow({
  membership,
  canEdit,
  onToggleManager,
  onRemove,
}: {
  membership: ProjectDetail['memberships'][number];
  canEdit: boolean;
  onToggleManager: (isManager: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1.5fr_120px_120px_80px] items-center gap-4 border-b border-slate-100 px-6 py-3 text-sm last:border-b-0">
      <div>
        <p className="font-semibold text-text">{membership.user.full_name}</p>
        <p className="text-xs text-muted">{membership.user.email} · {membership.user.role}</p>
      </div>
      <div className="text-right tabular-nums text-text">
        {Number.parseFloat(membership.hours_logged ?? '0').toFixed(2)} hr
      </div>
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={membership.is_project_manager}
          disabled={!canEdit}
          onChange={(e) => onToggleManager(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
      </div>
      <div className="flex justify-end">
        {canEdit ? (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
            title="Remove member"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
