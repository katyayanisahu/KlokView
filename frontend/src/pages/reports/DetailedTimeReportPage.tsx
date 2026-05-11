import { ChevronDown, Clock, Download, Filter, Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import PeriodSelector, { type Period } from '@/components/reports/PeriodSelector';
import { computeRange, formatRangeLabel, nudgeAnchor } from '@/components/reports/dateRange';
import { downloadCsv, timestampedFilename } from '@/components/reports/csvExport';
import { formatHours } from '@/components/reports/reportFormat';
import { useFiscalYearStartMonth, useWeekStart } from '@/utils/preferences';
import { listClients } from '@/api/clients';
import { listProjects, listTasks } from '@/api/projects';
import { listTeam } from '@/api/users';
import { deleteTimeEntry, listTimeEntries, updateTimeEntry } from '@/api/timeEntries';
import { createSavedReport } from '@/api/reports';
import { useConfirm } from '@/components/ConfirmDialog';
import SaveReportModal from '@/components/reports/SaveReportModal';
import type { Client, ProjectListItem, Task, TeamMember, TimeEntry } from '@/types';

type Group = 'date' | 'client' | 'project' | 'task' | 'person';
type Show = 'all' | 'billable' | 'non_billable';

const GROUP_LABEL: Record<Group, string> = {
  date: 'Date',
  client: 'Client',
  project: 'Project',
  task: 'Task',
  person: 'Person',
};

const SHOW_LABEL: Record<Show, string> = {
  all: 'All hours',
  billable: 'Billable only',
  non_billable: 'Non-billable only',
};

interface DetailedRow {
  id: number;
  date: string;
  user: string;
  client: string;
  project: string;
  task: string;
  description: string;
  hours: number;
  isBillable: boolean;
}

function entryToRow(e: TimeEntry): DetailedRow {
  return {
    id: e.id,
    date: e.date,
    user: e.user_name,
    client: e.client_name,
    project: e.project_name,
    task: e.task_name,
    description: e.notes,
    hours: Number.parseFloat(e.hours) || 0,
    isBillable: e.is_billable,
  };
}

function defaultMonthRange(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start: toIso(start), end: toIso(end) };
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DetailedTimeReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const weekStartsOn = useWeekStart();
  const fiscalStartMonth = useFiscalYearStartMonth();

  const hasExplicitDates = !!(searchParams.get('start_date') || searchParams.get('end_date'));
  const [period, setPeriod] = useState<Period>(
    (searchParams.get('period') as Period) ||
      (hasExplicitDates ? 'custom' : 'month'),
  );
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [hasRun, setHasRun] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);
  const [show, setShow] = useState<Show>('all');
  const [group, setGroup] = useState<Group>('date');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Filter state — seeded from URL params so deep links from Project detail work.
  const initialRange = useMemo(() => defaultMonthRange(), []);
  const [startDate, setStartDate] = useState(searchParams.get('start_date') ?? initialRange.start);
  const [endDate, setEndDate] = useState(searchParams.get('end_date') ?? initialRange.end);
  const [clientId, setClientId] = useState<string>(searchParams.get('client_id') ?? '');
  const [projectId, setProjectId] = useState<string>(searchParams.get('project_id') ?? '');
  const [taskId, setTaskId] = useState<string>(searchParams.get('task_id') ?? '');
  const [userId, setUserId] = useState<string>(searchParams.get('user_id') ?? '');

  // Strip URL params after consumption so the next session starts clean.
  useEffect(() => {
    if (searchParams.toString()) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the Period or anchor changes, sync the date inputs (unless custom).
  useEffect(() => {
    if (period === 'custom') return;
    if (period === 'all_time') {
      setStartDate('');
      setEndDate('');
      return;
    }
    const r = computeRange(period, anchor, weekStartsOn, fiscalStartMonth);
    setStartDate(r.start);
    setEndDate(r.end);
  }, [period, anchor, weekStartsOn, fiscalStartMonth]);

  const canNudge = !['all_time', 'custom'].includes(period);
  const handlePrev = canNudge ? () => setAnchor((a) => nudgeAnchor(a, period, -1)) : undefined;
  const handleNext = canNudge ? () => setAnchor((a) => nudgeAnchor(a, period, 1)) : undefined;

  // Filter dropdown sources
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);

  // Data
  const [rows, setRows] = useState<DetailedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load filter sources once
  useEffect(() => {
    Promise.all([
      listClients({ is_active: true }).then((r) => r.results).catch(() => [] as Client[]),
      listProjects({ is_active: true }).then((r) => r.results).catch(() => [] as ProjectListItem[]),
      listTasks({ is_active: true }).then((r) => r.results).catch(() => [] as Task[]),
      listTeam().catch(() => [] as TeamMember[]),
    ]).then(([c, p, t, m]) => {
      setClients(c);
      setProjects(p);
      setTasks(t);
      setTeam(m);
    });
  }, []);

  const runReport = useMemo(
    () => async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const entries = await listTimeEntries({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          client_id: clientId ? Number.parseInt(clientId, 10) : undefined,
          project_id: projectId ? Number.parseInt(projectId, 10) : undefined,
          task_id: taskId ? Number.parseInt(taskId, 10) : undefined,
          user_id: userId ? Number.parseInt(userId, 10) : undefined,
          is_billable:
            show === 'billable' ? true : show === 'non_billable' ? false : undefined,
          active_only: activeOnly,
        });
        setRows(entries.map(entryToRow));
        setHasRun(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Detailed time report failed', err);
        setLoadError('Could not load time entries.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate, clientId, projectId, taskId, userId, show, activeOnly],
  );

  // Auto-run on first mount and whenever the date window changes (period nav).
  useEffect(() => {
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const visibleRows = useMemo(
    () =>
      rows.filter((r) => {
        if (show === 'billable') return r.isBillable;
        if (show === 'non_billable') return !r.isBillable;
        return true;
      }),
    [rows, show],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, DetailedRow[]>();
    visibleRows.forEach((r) => {
      const key =
        group === 'date'
          ? r.date
          : group === 'client'
            ? r.client
            : group === 'project'
              ? r.project
              : group === 'task'
                ? r.task
                : r.user;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    });
    return Array.from(map.entries());
  }, [visibleRows, group]);

  const totalHours = visibleRows.reduce((acc, r) => acc + r.hours, 0);
  const billableHours = visibleRows.filter((r) => r.isBillable).reduce((a, r) => a + r.hours, 0);

  const toggleAll = () => {
    if (selected.size === visibleRows.length) setSelected(new Set());
    else setSelected(new Set(visibleRows.map((r) => r.id)));
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const { confirmDialog, ask } = useConfirm();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionFlash, setActionFlash] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const showActionFlash = (tone: 'success' | 'error', message: string) => {
    setActionFlash({ tone, message });
    setTimeout(() => setActionFlash(null), 5000);
  };

  // Pull a human-readable reason out of an axios error.
  const errorMessage = (err: unknown): string => {
    const detail = (err as { response?: { data?: unknown } } | undefined)?.response?.data;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      const d = detail as Record<string, unknown>;
      if (typeof d.detail === 'string') return d.detail;
      const first = Object.values(d)[0];
      if (typeof first === 'string') return first;
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    }
    return (err as { message?: string } | undefined)?.message ?? 'Unknown error';
  };

  const applyBillable = async (markBillable: boolean) => {
    setActionsOpen(false);
    if (selected.size === 0) return;
    setActionBusy(true);
    setActionFlash(null);
    const ids = Array.from(selected);
    const results = await Promise.allSettled(
      ids.map((id) => updateTimeEntry(id, { is_billable: markBillable })),
    );
    const succeeded = new Set<number>();
    const failures: { id: number; reason: string }[] = [];
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') succeeded.add(ids[idx]);
      else failures.push({ id: ids[idx], reason: errorMessage(r.reason) });
    });
    if (succeeded.size > 0) {
      setRows((prev) =>
        prev.map((r) => (succeeded.has(r.id) ? { ...r, isBillable: markBillable } : r)),
      );
    }
    setSelected(new Set(failures.map((f) => f.id)));
    if (failures.length === 0) {
      showActionFlash(
        'success',
        `Marked ${succeeded.size} ${succeeded.size === 1 ? 'entry' : 'entries'} ${markBillable ? 'billable' : 'non-billable'}.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('Bulk billable update failures', failures);
      const reason = failures[0].reason;
      showActionFlash(
        'error',
        succeeded.size > 0
          ? `Updated ${succeeded.size}, ${failures.length} failed: ${reason}`
          : `Could not update ${failures.length} ${failures.length === 1 ? 'entry' : 'entries'}: ${reason}`,
      );
    }
    setActionBusy(false);
  };

  const handleBulkDelete = async () => {
    setActionsOpen(false);
    if (selected.size === 0) return;
    const ok = await ask({
      title: `Delete ${selected.size} time ${selected.size === 1 ? 'entry' : 'entries'}?`,
      message: 'This permanently removes the selected entries. Cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setActionBusy(true);
    setActionFlash(null);
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => deleteTimeEntry(id)));
    const deleted = new Set<number>();
    const failures: { id: number; reason: string }[] = [];
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') deleted.add(ids[idx]);
      else failures.push({ id: ids[idx], reason: errorMessage(r.reason) });
    });
    if (deleted.size > 0) {
      setRows((prev) => prev.filter((r) => !deleted.has(r.id)));
    }
    setSelected(new Set(failures.map((f) => f.id)));
    if (failures.length === 0) {
      showActionFlash(
        'success',
        `Deleted ${deleted.size} ${deleted.size === 1 ? 'entry' : 'entries'}.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('Bulk delete failures', failures);
      const reason = failures[0].reason;
      showActionFlash(
        'error',
        deleted.size > 0
          ? `Deleted ${deleted.size}, ${failures.length} failed: ${reason}`
          : `Could not delete ${failures.length} ${failures.length === 1 ? 'entry' : 'entries'}: ${reason}`,
      );
    }
    setActionBusy(false);
  };

  const handleExportCsv = () => {
    downloadCsv({
      filename: timestampedFilename('detailed_time'),
      headers: ['Date', 'Client', 'Project', 'Task', 'Person', 'Notes', 'Hours', 'Billable'],
      rows: visibleRows.map((r) => [
        r.date,
        r.client,
        r.project,
        r.task,
        r.user,
        r.description,
        r.hours.toFixed(2),
        r.isBillable ? 'Yes' : 'No',
      ]),
    });
  };

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const handleSaveReport = async (name: string, isShared: boolean) => {
    await createSavedReport({
      name,
      kind: 'detailed_time',
      filters: {
        start_date: startDate,
        end_date: endDate,
        client_id: clientId || null,
        project_id: projectId || null,
        task_id: taskId || null,
        user_id: userId || null,
        show,
        group,
        active_only: activeOnly,
      },
      is_shared: isShared,
    });
    setSaveModalOpen(false);
    setSaveFlash(`"${name}" saved. Open it from the Saved Reports tab.`);
    setTimeout(() => setSaveFlash(null), 4000);
  };

  const clearFilters = () => {
    setClientId('');
    setProjectId('');
    setTaskId('');
    setUserId('');
    setShow('all');
    setActiveOnly(true);
    setStartDate(initialRange.start);
    setEndDate(initialRange.end);
  };

  return (
    <div className="space-y-5">
      {confirmDialog}
      {/* SECTION 1 — Header card: title + date nav + save action */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-2xl font-bold text-text sm:text-3xl">
                Detailed time report
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Drill into every entry — filter, group, edit, and export.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSaveModalOpen(true)}
            className="btn-outline gap-2 px-3 py-2 text-sm"
          >
            <Save className="h-4 w-4" />
            Save report
          </button>
        </div>
        {saveFlash ? (
          <p className="mx-4 mb-3 rounded-md bg-accent-soft px-3 py-2 text-xs text-accent-dark sm:mx-6">
            {saveFlash}
          </p>
        ) : null}
        <div className="rounded-b-xl border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6">
          <PeriodSelector
            period={period}
            onPeriodChange={(next) => {
              setPeriod(next);
              setAnchor(new Date());
            }}
            rangeLabel={
              period === 'all_time'
                ? 'All time'
                : startDate && endDate
                  ? formatRangeLabel(startDate, endDate)
                  : 'Custom range'
            }
            onPrev={handlePrev}
            onNext={handleNext}
            customStart={startDate}
            customEnd={endDate}
            onCustomChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
        </div>
      </section>

      {/* SECTION 2 — Filter panel */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-primary/15 bg-primary-soft/40 px-4 py-3 sm:px-6">
          <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary ring-1 ring-primary/20">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-sm font-bold text-text">Filters</h3>
            <p className="text-[11px] text-muted">Narrow down which entries appear in the report.</p>
          </div>
        </div>
        <div className="p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilterField label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </FilterField>
          <FilterField label="End date">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </FilterField>
          <FilterField label="Clients">
            <select
              className="input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Projects">
            <select
              className="input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {projects
                .filter((p) => !clientId || p.client_id === Number.parseInt(clientId, 10))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </FilterField>
          <FilterField label="Tasks">
            <select
              className="input"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
            >
              <option value="">All tasks</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Team">
            <select
              className="input"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Everyone</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label=" ">
            <label className="flex cursor-pointer items-center gap-2 py-2 text-sm text-text">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              Active projects only
            </label>
          </FilterField>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={runReport}
            disabled={loading}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            <Filter className="h-4 w-4" />
            {loading ? 'Running…' : 'Run report'}
          </button>
          <button type="button" onClick={clearFilters} className="btn-outline px-4 py-2 text-sm">
            Clear
          </button>
          {loadError ? (
            <span className="text-xs text-danger">{loadError}</span>
          ) : null}
        </div>
        </div>
      </section>

      {/* SECTION 3 — Results table */}
      {hasRun ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-primary-soft/40 to-white px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
                <Clock className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
                  Total hours
                </p>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <p className="font-heading text-3xl font-bold tabular-nums text-text">
                    {formatHours(totalHours)}
                  </p>
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-accent-dark">
                      {formatHours(billableHours)}
                    </span>{' '}
                    billable
                  </p>
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-text shadow-sm ring-1 ring-slate-200">
                <span className="tabular-nums">{visibleRows.length}</span>
                <span className="text-muted">{visibleRows.length === 1 ? 'entry' : 'entries'}</span>
              </div>
            </div>
          </div>

          {actionFlash ? (
            <div
              className={`border-b px-4 py-2 text-xs sm:px-5 ${
                actionFlash.tone === 'success'
                  ? 'border-accent-soft bg-accent-soft text-accent-dark'
                  : 'border-danger/30 bg-danger/10 text-danger'
              }`}
            >
              {actionFlash.message}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <SimpleSelect
                value={show}
                onChange={(v) => setShow(v as Show)}
                options={Object.entries(SHOW_LABEL).map(([v, l]) => ({ value: v, label: `Show: ${l}` }))}
              />
              <SimpleSelect
                value={group}
                onChange={(v) => setGroup(v as Group)}
                options={Object.entries(GROUP_LABEL).map(([v, l]) => ({ value: v, label: `Group by: ${l}` }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActionsOpen((o) => !o)}
                  disabled={selected.size === 0 || actionBusy}
                  className="btn-outline gap-1 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {actionBusy ? 'Working…' : `Actions (${selected.size})`}
                  <ChevronDown className="h-4 w-4 text-muted" />
                </button>
                {actionsOpen ? (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setActionsOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-lg">
                      <button
                        type="button"
                        onClick={() => applyBillable(true)}
                        className="block w-full px-3 py-2 text-left transition hover:bg-bg"
                      >
                        Mark billable
                      </button>
                      <button
                        type="button"
                        onClick={() => applyBillable(false)}
                        className="block w-full px-3 py-2 text-left transition hover:bg-bg"
                      >
                        Mark non-billable
                      </button>
                      <div className="border-t border-slate-100" />
                      <button
                        type="button"
                        onClick={handleBulkDelete}
                        className="block w-full px-3 py-2 text-left text-danger transition hover:bg-danger/10"
                      >
                        Delete selected
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="btn-outline gap-2 px-3 py-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                  <th className="px-4 py-3 sm:px-5">
                    <input
                      type="checkbox"
                      checked={selected.size === visibleRows.length && visibleRows.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                    />
                  </th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Client</th>
                  <th className="px-3 py-3">Project</th>
                  <th className="px-3 py-3">Task</th>
                  <th className="px-3 py-3">Person</th>
                  <th className="px-4 py-3 text-right sm:px-5">Hours</th>
                </tr>
              </thead>
              <tbody>
                {grouped.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-muted">
                      {loading ? 'Loading…' : 'No time entries match the filters.'}
                    </td>
                  </tr>
                ) : (
                  grouped.map(([key, items]) => {
                    const groupHours = items.reduce((a, r) => a + r.hours, 0);
                    return (
                      <GroupRows
                        key={key}
                        groupKey={key}
                        items={items}
                        groupHours={groupHours}
                        selected={selected}
                        onToggle={toggleOne}
                      />
                    );
                  })
                )}
                <tr className="bg-bg/40 font-semibold">
                  <td className="px-4 py-3 sm:px-5" colSpan={6}>
                    Total
                  </td>
                  <td className="px-4 py-3 text-right sm:px-5">{formatHours(totalHours)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-muted">
          Set your filters and click <strong className="text-text">Run report</strong> to load detailed time entries.
        </section>
      )}

      <SaveReportModal
        open={saveModalOpen}
        defaultName="My detailed time report"
        onCancel={() => setSaveModalOpen(false)}
        onSave={handleSaveReport}
      />
    </div>
  );
}

function GroupRows({
  groupKey,
  items,
  groupHours,
  selected,
  onToggle,
}: {
  groupKey: string;
  items: DetailedRow[];
  groupHours: number;
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  return (
    <>
      <tr className="bg-bg/60 text-xs font-semibold uppercase tracking-wider text-muted">
        <td className="px-4 py-2 sm:px-5" colSpan={6}>
          {groupKey}
        </td>
        <td className="px-4 py-2 text-right text-text sm:px-5">{formatHours(groupHours)}</td>
      </tr>
      {items.map((r) => (
        <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-bg/40">
          <td className="px-4 py-3 sm:px-5">
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() => onToggle(r.id)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
            />
          </td>
          <td className="px-3 py-3 text-text">{r.date}</td>
          <td className="px-3 py-3 text-text">{r.client}</td>
          <td className="px-3 py-3">
            <span className="block font-medium text-text">{r.project}</span>
            {r.description ? <span className="text-xs text-muted">{r.description}</span> : null}
          </td>
          <td className="px-3 py-3 text-text">{r.task}</td>
          <td className="px-3 py-3 text-text">{r.user}</td>
          <td className="px-4 py-3 text-right sm:px-5">
            <span className="font-semibold text-primary">{formatHours(r.hours)}</span>
            {r.isBillable ? (
              <p className="text-xs text-success">Billable</p>
            ) : (
              <p className="text-xs text-muted">Non-billable</p>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label whitespace-nowrap">{label}</label>
      {children}
    </div>
  );
}

function SimpleSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 pr-8 text-xs font-semibold text-text"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
    </div>
  );
}
