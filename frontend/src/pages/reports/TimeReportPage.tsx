import { BarChart3, ChevronRight, Download, Printer, Save } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import BillableDonut from '@/components/reports/BillableDonut';
import PeriodSelector, { type Period } from '@/components/reports/PeriodSelector';
import { formatHours } from '@/components/reports/reportFormat';
import {
  computeRange,
  formatRangeLabel as formatRange,
  nudgeAnchor,
} from '@/components/reports/dateRange';
import { useFiscalYearStartMonth, useWeekStart } from '@/utils/preferences';
import { downloadCsv, timestampedFilename } from '@/components/reports/csvExport';
import SaveReportModal from '@/components/reports/SaveReportModal';
import {
  createSavedReport,
  getTimeReport,
  type TaskBreakdownRow,
  type TimeReport,
  type TimeReportRow,
} from '@/api/reports';
import {
  TIME_CLIENTS,
  TIME_PROJECTS,
  TIME_TASKS,
  TIME_TEAM,
  TIME_TOTALS,
} from '@/mock/reportsData';
import { useAuthStore } from '@/store/authStore';
import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import { formatCurrency } from '@/utils/format';

interface ClientView {
  id: number;
  name: string;
  hours: number;
  billableHours: number;
  billableAmount: number;
}

interface ProjectView {
  id: number;
  name: string;
  clientId: number;
  clientName: string;
  type: string;
  hours: number;
  billableHours: number;
  billableAmount: number;
}

interface TaskView {
  id: number;
  name: string;
  color: string;
  hours: number;
  billableHours: number;
  billableAmount: number;
}

interface TeamView {
  id: number;
  name: string;
  initials: string;
  hours: number;
  billableHours: number;
  billableAmount: number;
  utilization: number;
}

const TASK_PALETTE = ['#0052CC', '#5CDCA5', '#F59E0B', '#EF4444', '#8B5CF6', '#10B981'];

function rowToClient(r: TimeReportRow): ClientView {
  return {
    id: r.id ?? 0,
    name: r.name,
    hours: Number.parseFloat(r.hours) || 0,
    billableHours: Number.parseFloat(r.billable_hours) || 0,
    billableAmount: Number.parseFloat(r.billable_amount ?? '0') || 0,
  };
}

function rowToProject(r: TimeReportRow): ProjectView {
  return {
    id: r.id ?? 0,
    name: r.name,
    clientId: r.client_id ?? 0,
    clientName: r.client_name ?? '',
    type: r.type ?? '',
    hours: Number.parseFloat(r.hours) || 0,
    billableHours: Number.parseFloat(r.billable_hours) || 0,
    billableAmount: Number.parseFloat(r.billable_amount ?? '0') || 0,
  };
}

function rowToTask(r: TimeReportRow, idx: number): TaskView {
  return {
    id: r.id ?? 0,
    name: r.name,
    color: TASK_PALETTE[idx % TASK_PALETTE.length],
    hours: Number.parseFloat(r.hours) || 0,
    billableHours: Number.parseFloat(r.billable_hours) || 0,
    billableAmount: Number.parseFloat(r.billable_amount ?? '0') || 0,
  };
}

function rowToTeam(r: TimeReportRow): TeamView {
  return {
    id: r.id ?? 0,
    name: r.name,
    initials: r.initials ?? r.name.slice(0, 2).toUpperCase(),
    hours: Number.parseFloat(r.hours) || 0,
    billableHours: Number.parseFloat(r.billable_hours) || 0,
    billableAmount: Number.parseFloat(r.billable_amount ?? '0') || 0,
    utilization: r.utilization ?? 0,
  };
}


type SubView = 'clients' | 'projects' | 'tasks' | 'team';

const SUB_VIEWS: { key: SubView; label: string }[] = [
  { key: 'clients', label: 'Clients' },
  { key: 'projects', label: 'Projects' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'team', label: 'Team' },
];

export default function TimeReportPage() {
  const user = useAuthStore((s) => s.user);
  const isMember = user?.role === 'member';
  // Subscribe so formatCurrency picks up workspace preference changes.
  useAccountSettingsStore((s) => s.settings?.currency);
  useAccountSettingsStore((s) => s.settings?.number_format);
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [subView, setSubView] = useState<SubView>('clients');
  const [activeOnly, setActiveOnly] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [drilldownClientId, setDrilldownClientId] = useState<number | null>(null);
  const [drilldownProjectId, setDrilldownProjectId] = useState<number | null>(null);
  const [drilldownSubView, setDrilldownSubView] = useState<'projects' | 'tasks' | 'team'>('projects');
  const [report, setReport] = useState<TimeReport | null>(null);
  const [clientReport, setClientReport] = useState<TimeReport | null>(null);
  const [projectReport, setProjectReport] = useState<TimeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const weekStartsOn = useWeekStart();
  const fiscalStartMonth = useFiscalYearStartMonth();
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const monthStartIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);
  const [customStart, setCustomStart] = useState<string>(monthStartIso);
  const [customEnd, setCustomEnd] = useState<string>(todayIso);
  const range = useMemo(() => {
    if (period === 'custom') return { start: customStart, end: customEnd };
    return computeRange(period, anchor, weekStartsOn, fiscalStartMonth);
  }, [period, anchor, weekStartsOn, fiscalStartMonth, customStart, customEnd]);
  const isAllTime = period === 'all_time';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getTimeReport({
      start: range.start,
      end: range.end,
      active_only: activeOnly || undefined,
    })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('Time report fetch failed; falling back to mock', err);
          setLoadError('Could not load live data — showing sample.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, activeOnly, isAllTime]);

  // Fetch the client-scoped report when user drills into a client.
  useEffect(() => {
    if (drilldownClientId == null) {
      setClientReport(null);
      return;
    }
    let cancelled = false;
    getTimeReport({
      start: range.start,
      end: range.end,
      active_only: activeOnly || undefined,
      client_id: drilldownClientId,
    })
      .then((data) => {
        if (!cancelled) setClientReport(data);
      })
      .catch(() => {
        if (!cancelled) setClientReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [drilldownClientId, range.start, range.end, activeOnly, isAllTime]);

  // Fetch the project-scoped report when user drills into a project.
  useEffect(() => {
    if (drilldownProjectId == null) {
      setProjectReport(null);
      return;
    }
    let cancelled = false;
    getTimeReport({
      start: range.start,
      end: range.end,
      active_only: activeOnly || undefined,
      project_id: drilldownProjectId,
    })
      .then((data) => {
        if (!cancelled) setProjectReport(data);
      })
      .catch(() => {
        if (!cancelled) setProjectReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [drilldownProjectId, range.start, range.end, activeOnly, isAllTime]);

  // Reset drilldown sub-view when leaving a drilldown level.
  useEffect(() => {
    if (drilldownProjectId !== null) {
      // Project view defaults to Tasks (Harvest pattern).
      setDrilldownSubView('tasks');
    } else if (drilldownClientId !== null) {
      // Client view defaults to Projects.
      setDrilldownSubView('projects');
    }
  }, [drilldownClientId, drilldownProjectId]);

  const canNudge = !['all_time', 'custom'].includes(period);
  const handlePrev = canNudge ? () => setAnchor((a) => nudgeAnchor(a, period, -1)) : undefined;
  const handleNext = canNudge ? () => setAnchor((a) => nudgeAnchor(a, period, 1)) : undefined;

  // Live data when the API is reachable; otherwise the mock fallback (billable amount = 0).
  const clientsData: ClientView[] = useMemo(
    () =>
      report
        ? report.clients.map(rowToClient)
        : TIME_CLIENTS.map((c) => ({
            id: c.id,
            name: c.name,
            hours: c.hours,
            billableHours: c.billableHours,
            billableAmount: c.billableAmount ?? 0,
          })),
    [report],
  );
  const projectsData: ProjectView[] = useMemo(
    () =>
      report
        ? report.projects.map(rowToProject)
        : TIME_PROJECTS.map((p) => ({
            id: p.id,
            name: p.name,
            clientId: p.clientId,
            clientName: p.clientName,
            type: p.type,
            hours: p.hours,
            billableHours: p.billableHours,
            billableAmount: p.billableAmount ?? 0,
          })),
    [report],
  );
  const tasksData: TaskView[] = useMemo(
    () =>
      report
        ? report.tasks.map(rowToTask)
        : TIME_TASKS.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            hours: t.hours,
            billableHours: t.billableHours,
            billableAmount: t.billableAmount ?? 0,
          })),
    [report],
  );
  const teamData: TeamView[] = useMemo(
    () =>
      report
        ? report.team.map(rowToTeam)
        : TIME_TEAM.map((m) => ({
            id: m.id,
            name: m.name,
            initials: m.initials,
            hours: m.hours,
            billableHours: m.billableHours,
            billableAmount: 0,
            utilization: m.utilization,
          })),
    [report],
  );

  const totals = report
    ? {
        totalHours: Number.parseFloat(report.totals.total_hours) || 0,
        billableHours: Number.parseFloat(report.totals.billable_hours) || 0,
        nonBillableHours: Number.parseFloat(report.totals.non_billable_hours) || 0,
        billablePercent: report.totals.billable_percent,
        billableAmount: Number.parseFloat(report.totals.billable_amount ?? '0') || 0,
      }
    : { ...TIME_TOTALS, billableAmount: 0 };

  const drilldownClient = useMemo(
    () =>
      drilldownClientId
        ? clientsData.find((c) => c.id === drilldownClientId) ?? null
        : null,
    [drilldownClientId, clientsData],
  );

  // Client-scoped data — comes from `clientReport` when loaded; otherwise we
  // synthesize from the top-level `clientsData` filtered by client id.
  const clientScopedProjects = useMemo<ProjectView[]>(
    () =>
      clientReport
        ? clientReport.projects.map(rowToProject)
        : drilldownClientId
          ? projectsData.filter((p) => p.clientId === drilldownClientId)
          : [],
    [clientReport, drilldownClientId, projectsData],
  );

  const clientScopedTasks = useMemo<TaskView[]>(
    () =>
      clientReport
        ? clientReport.tasks.map(rowToTask)
        : [],
    [clientReport],
  );

  const clientScopedTeam = useMemo<TeamView[]>(
    () =>
      clientReport
        ? clientReport.team.map(rowToTeam)
        : [],
    [clientReport],
  );

  const clientTotals = useMemo(() => {
    if (!clientReport) {
      return drilldownClient
        ? {
            totalHours: drilldownClient.hours,
            billableHours: drilldownClient.billableHours,
            nonBillableHours: drilldownClient.hours - drilldownClient.billableHours,
            billablePercent:
              drilldownClient.hours > 0
                ? Math.round((drilldownClient.billableHours / drilldownClient.hours) * 100)
                : 0,
            billableAmount: drilldownClient.billableAmount,
          }
        : null;
    }
    return {
      totalHours: Number.parseFloat(clientReport.totals.total_hours) || 0,
      billableHours: Number.parseFloat(clientReport.totals.billable_hours) || 0,
      nonBillableHours: Number.parseFloat(clientReport.totals.non_billable_hours) || 0,
      billablePercent: clientReport.totals.billable_percent,
      billableAmount: Number.parseFloat(clientReport.totals.billable_amount ?? '0') || 0,
    };
  }, [clientReport, drilldownClient]);

  const drilldownProject = useMemo(
    () =>
      drilldownProjectId
        ? clientScopedProjects.find((p) => p.id === drilldownProjectId) ??
          projectsData.find((p) => p.id === drilldownProjectId) ?? null
        : null,
    [drilldownProjectId, clientScopedProjects, projectsData],
  );

  const projectTaskBreakdown: TaskBreakdownRow[] = projectReport?.task_breakdown ?? [];

  const projectScopedTeam = useMemo<TeamView[]>(
    () =>
      projectReport
        ? projectReport.team.map(rowToTeam)
        : [],
    [projectReport],
  );

  const projectTotals = useMemo(() => {
    if (!projectReport) {
      return drilldownProject
        ? {
            totalHours: drilldownProject.hours,
            billableHours: drilldownProject.billableHours,
            nonBillableHours: drilldownProject.hours - drilldownProject.billableHours,
            billablePercent:
              drilldownProject.hours > 0
                ? Math.round((drilldownProject.billableHours / drilldownProject.hours) * 100)
                : 0,
            billableAmount: drilldownProject.billableAmount,
          }
        : null;
    }
    return {
      totalHours: Number.parseFloat(projectReport.totals.total_hours) || 0,
      billableHours: Number.parseFloat(projectReport.totals.billable_hours) || 0,
      nonBillableHours: Number.parseFloat(projectReport.totals.non_billable_hours) || 0,
      billablePercent: projectReport.totals.billable_percent,
      billableAmount: Number.parseFloat(projectReport.totals.billable_amount ?? '0') || 0,
    };
  }, [projectReport, drilldownProject]);

  const rangeLabel = isAllTime
    ? 'All time'
    : formatRange(range.start, range.end);

  // Build a Detailed Time deep link preserving the current date window + drilldown context.
  const hoursLink = (filters: {
    client_id?: number;
    project_id?: number;
    task_id?: number;
    user_id?: number;
  }): string => {
    const params = new URLSearchParams();
    if (!isAllTime) {
      params.set('start_date', range.start);
      params.set('end_date', range.end);
    }
    if (drilldownClientId != null) params.set('client_id', String(drilldownClientId));
    if (drilldownProjectId != null) params.set('project_id', String(drilldownProjectId));
    if (filters.client_id != null) params.set('client_id', String(filters.client_id));
    if (filters.project_id != null) params.set('project_id', String(filters.project_id));
    if (filters.task_id != null) params.set('task_id', String(filters.task_id));
    if (filters.user_id != null) params.set('user_id', String(filters.user_id));
    return `/reports/detailed-time?${params.toString()}`;
  };

  const handleExportCsv = () => {
    setExportOpen(false);
    if (drilldownProject && projectTaskBreakdown.length > 0) {
      const rows: (string | number)[][] = [];
      projectTaskBreakdown.forEach((task) => {
        if (isMember) {
          rows.push([task.name, '', task.hours, task.billable_hours]);
        } else {
          rows.push([task.name, '', task.hours, task.billable_hours, '', '']);
        }
        task.members.forEach((m) => {
          if (isMember) {
            rows.push([task.name, m.name, m.hours, m.billable_hours]);
          } else {
            rows.push([
              task.name,
              m.name,
              m.hours,
              m.billable_hours,
              m.rate,
              m.billable_amount,
            ]);
          }
        });
      });
      downloadCsv({
        filename: timestampedFilename(`time_${drilldownProject.name.replace(/\s+/g, '-')}`),
        headers: isMember
          ? ['Task', 'Member', 'Hours', 'Billable hours']
          : ['Task', 'Member', 'Hours', 'Billable hours', 'Rate', 'Billable amount'],
        rows,
      });
      return;
    }

    if (subView === 'clients') {
      downloadCsv({
        filename: timestampedFilename('time_clients'),
        headers: ['Client', 'Hours', 'Billable hours'],
        rows: clientsData.map((c) => [c.name, c.hours.toFixed(2), c.billableHours.toFixed(2)]),
      });
    } else if (subView === 'projects') {
      downloadCsv({
        filename: timestampedFilename('time_projects'),
        headers: ['Project', 'Client', 'Hours', 'Billable hours'],
        rows: projectsData.map((p) => [
          p.name, p.clientName, p.hours.toFixed(2), p.billableHours.toFixed(2),
        ]),
      });
    } else if (subView === 'tasks') {
      downloadCsv({
        filename: timestampedFilename('time_tasks'),
        headers: ['Task', 'Hours', 'Billable hours'],
        rows: tasksData.map((t) => [t.name, t.hours.toFixed(2), t.billableHours.toFixed(2)]),
      });
    } else {
      downloadCsv({
        filename: timestampedFilename('time_team'),
        headers: ['Member', 'Hours', 'Utilization %', 'Billable hours'],
        rows: teamData.map((m) => [
          m.name, m.hours.toFixed(2), m.utilization, m.billableHours.toFixed(2),
        ]),
      });
    }
  };

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const handleSaveReport = async (name: string, isShared: boolean) => {
    await createSavedReport({
      name,
      kind: 'time',
      filters: { period, subView, activeOnly },
      is_shared: isShared,
    });
    setSaveModalOpen(false);
    setSaveFlash(`"${name}" saved. Open it from the Saved Reports tab.`);
    setTimeout(() => setSaveFlash(null), 4000);
  };

  return (
    <div className="space-y-5">
      {/* SECTION 1 — Header card: title + date nav + save action */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-2xl font-bold text-text sm:text-3xl">Time report</h2>
              <p className="mt-0.5 text-xs text-muted">
                Hours grouped by client, project, task, and team.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSaveModalOpen(true)}
            className="btn-outline w-full justify-center gap-2 px-3 py-2 text-sm sm:w-auto"
          >
            <Save className="h-4 w-4" />
            Save report
          </button>
        </div>
        <div className="rounded-b-xl border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6">
          <PeriodSelector
            period={period}
            onPeriodChange={(next) => {
              setPeriod(next);
              setAnchor(new Date());
            }}
            rangeLabel={rangeLabel}
            onPrev={handlePrev}
            onNext={handleNext}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={(s, e) => {
              setCustomStart(s);
              setCustomEnd(e);
            }}
          />
        </div>
        {saveFlash ? (
          <p className="mx-4 mb-3 rounded-md bg-accent-soft px-3 py-2 text-xs text-accent-dark sm:mx-6">
            {saveFlash}
          </p>
        ) : loading ? (
          <p className="mx-4 mb-3 text-xs text-muted sm:mx-6">Loading…</p>
        ) : loadError ? (
          <p className="mx-4 mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text/80 sm:mx-6">
            {loadError}
          </p>
        ) : null}
      </section>

      {/* Drilldown header — bigger Harvest-style title + breadcrumb + "See full report" link */}
      {drilldownClient || drilldownProject ? (
        <section>
          <nav className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => {
                setDrilldownClientId(null);
                setDrilldownProjectId(null);
              }}
              className="text-primary hover:underline"
            >
              Time report
            </button>
            {drilldownClient ? (
              <>
                <span className="text-muted">/</span>
                <button
                  type="button"
                  onClick={() => setDrilldownProjectId(null)}
                  className={
                    drilldownProject
                      ? 'text-primary hover:underline'
                      : 'text-text'
                  }
                >
                  {drilldownClient.name}
                </button>
              </>
            ) : null}
          </nav>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-heading text-2xl font-bold text-text sm:text-3xl">
              {drilldownProject?.name ?? drilldownClient?.name}
            </h2>
            {drilldownProject ? (
              <Link
                to={`/projects/${drilldownProject.id}`}
                className="text-sm font-semibold text-primary hover:underline"
              >
                See full project report →
              </Link>
            ) : drilldownClient ? (
              <Link
                to={`/manage/clients`}
                className="text-sm font-semibold text-primary hover:underline"
              >
                See full client report →
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* SECTION 2 — KPI Summary (extends with Billable amount + Uninvoiced when drilled in) */}
      {(() => {
        const activeTotals = drilldownProject
          ? projectTotals
          : drilldownClient
            ? clientTotals
            : totals;
        const showMoneyKpis = (!!drilldownProject || !!drilldownClient) && !isMember;
        if (!activeTotals) return null;
        return (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid gap-4 sm:gap-5 md:grid-cols-3 md:items-stretch">
              <div className="rounded-lg bg-bg p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Total hours</p>
                <p className="mt-2 font-heading text-3xl font-bold text-text">
                  {formatHours(activeTotals.totalHours)}
                </p>
              </div>
              <div className="rounded-lg bg-bg p-4">
                <BillableDonut
                  billablePercent={activeTotals.billablePercent}
                  billableHours={activeTotals.billableHours}
                  nonBillableHours={activeTotals.nonBillableHours}
                />
              </div>
              {showMoneyKpis ? (
                <div className="rounded-lg bg-bg p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Billable amount
                  </p>
                  <p className="mt-2 font-heading text-3xl font-bold text-text">
                    {formatCurrency(activeTotals.billableAmount)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Billable hours × project rate
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-bg p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Billable hours
                  </p>
                  <p className="mt-2 font-heading text-3xl font-bold text-text">
                    {formatHours(activeTotals.billableHours)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Non-billable {formatHours(activeTotals.nonBillableHours)}
                  </p>
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* SECTION 3 — Data table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Sub-view tabs (vary by drilldown level) + table actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1 overflow-x-auto">
            {drilldownProject
              ? (['tasks', 'team'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDrilldownSubView(key)}
                    className={`relative shrink-0 px-3 py-2 text-sm font-semibold transition ${
                      drilldownSubView === key ? 'text-primary' : 'text-muted hover:text-text'
                    }`}
                  >
                    {key === 'tasks' ? 'Tasks' : 'Team'}
                    {drilldownSubView === key ? (
                      <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-sm bg-primary" />
                    ) : null}
                  </button>
                ))
              : drilldownClient
                ? (['projects', 'tasks', 'team'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDrilldownSubView(key)}
                      className={`relative shrink-0 px-3 py-2 text-sm font-semibold transition ${
                        drilldownSubView === key ? 'text-primary' : 'text-muted hover:text-text'
                      }`}
                    >
                      {key === 'projects' ? 'Projects' : key === 'tasks' ? 'Tasks' : 'Team'}
                      {drilldownSubView === key ? (
                        <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-sm bg-primary" />
                      ) : null}
                    </button>
                  ))
                : SUB_VIEWS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setSubView(tab.key);
                        setDrilldownClientId(null);
                      }}
                      className={`relative shrink-0 px-3 py-2 text-sm font-semibold transition ${
                        subView === tab.key ? 'text-primary' : 'text-muted hover:text-text'
                      }`}
                    >
                      {tab.label}
                      {subView === tab.key ? (
                        <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-sm bg-primary" />
                      ) : null}
                    </button>
                  ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="hidden cursor-pointer items-center gap-2 text-xs text-muted sm:flex">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              Active projects only
            </label>
            <button type="button" className="btn-outline px-3 py-1.5 text-xs">
              Detailed report
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((o) => !o)}
                className="btn-outline gap-2 px-3 py-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
              {exportOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                    onClick={handleExportCsv}
                  >
                    CSV
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-muted hover:bg-slate-50"
              aria-label="Print"
              title="Print"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {drilldownProject ? (
            drilldownSubView === 'tasks' ? (
              <ProjectTaskBreakdownTable
                rows={projectTaskBreakdown}
                loading={projectReport === null}
                hoursLink={hoursLink}
                hideAmount={isMember}
              />
            ) : (
              <TeamTable rows={projectScopedTeam} hoursLink={hoursLink} hideAmount={isMember} />
            )
          ) : drilldownClient ? (
            drilldownSubView === 'projects' ? (
              <DrilldownProjectsTable
                rows={clientScopedProjects}
                totalHours={clientTotals?.totalHours ?? drilldownClient.hours}
                onDrill={(id) => setDrilldownProjectId(id)}
                hoursLink={hoursLink}
                hideAmount={isMember}
              />
            ) : drilldownSubView === 'tasks' ? (
              <TasksTable rows={clientScopedTasks} hoursLink={hoursLink} hideAmount={isMember} />
            ) : (
              <TeamTable rows={clientScopedTeam} hoursLink={hoursLink} hideAmount={isMember} />
            )
          ) : subView === 'clients' ? (
            <ClientsTable
              rows={clientsData}
              onDrill={(id) => setDrilldownClientId(id)}
              hoursLink={hoursLink}
              hideAmount={isMember}
            />
          ) : subView === 'projects' ? (
            <ProjectsTable
              rows={projectsData}
              onDrill={(id) => setDrilldownProjectId(id)}
              hoursLink={hoursLink}
              hideAmount={isMember}
            />
          ) : subView === 'tasks' ? (
            <TasksTable rows={tasksData} hoursLink={hoursLink} hideAmount={isMember} />
          ) : (
            <TeamTable rows={teamData} hoursLink={hoursLink} hideAmount={isMember} />
          )}
        </div>
      </section>

      <SaveReportModal
        open={saveModalOpen}
        defaultName="My time report"
        onCancel={() => setSaveModalOpen(false)}
        onSave={handleSaveReport}
      />
    </div>
  );
}

type HoursLinkBuilder = (filters: {
  client_id?: number;
  project_id?: number;
  task_id?: number;
  user_id?: number;
}) => string;

function ClientsTable({
  rows,
  onDrill,
  hoursLink,
  hideAmount,
}: {
  rows: ClientView[];
  onDrill: (id: number) => void;
  hoursLink: HoursLinkBuilder;
  hideAmount?: boolean;
}) {
  const total = rows.reduce(
    (acc, c) => ({
      hours: acc.hours + c.hours,
      billableHours: acc.billableHours + c.billableHours,
      billableAmount: acc.billableAmount + c.billableAmount,
    }),
    { hours: 0, billableHours: 0, billableAmount: 0 },
  );
  if (rows.length === 0) return <EmptyTimeRow />;
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
          <th className="px-4 py-3 sm:px-5">Name</th>
          <th className="px-4 py-3">Hours</th>
          <th className="px-4 py-3">Billable hours</th>
          {!hideAmount && <th className="px-4 py-3 text-right sm:px-5">Billable amount</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const billablePct = c.hours > 0 ? Math.round((c.billableHours / c.hours) * 100) : 0;
          return (
            <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-bg/60">
              <td className="px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => onDrill(c.id)}
                  className="font-semibold text-primary hover:underline"
                >
                  {c.name}
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    to={hoursLink({ client_id: c.id })}
                    className="font-semibold text-primary hover:underline"
                  >
                    {formatHours(c.hours)}
                  </Link>
                  <BarMini value={c.hours > 0 ? c.billableHours / c.hours : 0} />
                </div>
              </td>
              <td className="px-4 py-3 text-text">
                {formatHours(c.billableHours)} <span className="text-muted">({billablePct}%)</span>
              </td>
              {!hideAmount && (
                <td className="px-4 py-3 text-right font-semibold text-text sm:px-5">
                  {formatCurrency(c.billableAmount)}
                </td>
              )}
            </tr>
          );
        })}
        <tr className="bg-bg/40 font-semibold">
          <td className="px-4 py-3 sm:px-5">Total</td>
          <td className="px-4 py-3">{formatHours(total.hours)}</td>
          <td className="px-4 py-3">{formatHours(total.billableHours)}</td>
          {!hideAmount && (
            <td className="px-4 py-3 text-right sm:px-5">{formatCurrency(total.billableAmount)}</td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

function ProjectsTable({
  rows,
  onDrill,
  hoursLink,
  hideAmount,
}: {
  rows: ProjectView[];
  onDrill?: (id: number) => void;
  hoursLink: HoursLinkBuilder;
  hideAmount?: boolean;
}) {
  if (rows.length === 0) return <EmptyTimeRow />;
  const total = rows.reduce(
    (acc, p) => ({
      hours: acc.hours + p.hours,
      billable: acc.billable + p.billableHours,
      amount: acc.amount + p.billableAmount,
    }),
    { hours: 0, billable: 0, amount: 0 },
  );
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
          <th className="px-4 py-3 sm:px-5">Name</th>
          <th className="px-4 py-3">Hours</th>
          <th className="px-4 py-3">Billable hours</th>
          {!hideAmount && <th className="px-4 py-3 text-right sm:px-5">Billable amount</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const billablePct = p.hours > 0 ? Math.round((p.billableHours / p.hours) * 100) : 0;
          return (
            <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-bg/60">
              <td className="px-4 py-3 sm:px-5">
                {onDrill ? (
                  <button
                    type="button"
                    onClick={() => onDrill(p.id)}
                    className="block font-semibold text-primary hover:underline"
                  >
                    {p.name}
                  </button>
                ) : (
                  <span className="block font-semibold text-text">{p.name}</span>
                )}
                <span className="text-xs text-muted">{p.clientName}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    to={hoursLink({ project_id: p.id })}
                    className="font-semibold text-primary hover:underline"
                  >
                    {formatHours(p.hours)}
                  </Link>
                  <BarMini value={p.hours > 0 ? p.billableHours / p.hours : 0} />
                </div>
              </td>
              <td className="px-4 py-3 text-text">
                {formatHours(p.billableHours)} <span className="text-muted">({billablePct}%)</span>
              </td>
              {!hideAmount && (
                <td className="px-4 py-3 text-right font-semibold text-text sm:px-5">
                  {formatCurrency(p.billableAmount)}
                </td>
              )}
            </tr>
          );
        })}
        <tr className="bg-bg/40 font-semibold">
          <td className="px-4 py-3 sm:px-5">Total</td>
          <td className="px-4 py-3">{formatHours(total.hours)}</td>
          <td className="px-4 py-3">{formatHours(total.billable)}</td>
          {!hideAmount && (
            <td className="px-4 py-3 text-right sm:px-5">{formatCurrency(total.amount)}</td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

function TasksTable({
  rows,
  hoursLink,
  hideAmount,
}: {
  rows: TaskView[];
  hoursLink: HoursLinkBuilder;
  hideAmount?: boolean;
}) {
  if (rows.length === 0) return <EmptyTimeRow />;
  const total = rows.reduce(
    (acc, t) => ({
      hours: acc.hours + t.hours,
      billable: acc.billable + t.billableHours,
      amount: acc.amount + t.billableAmount,
    }),
    { hours: 0, billable: 0, amount: 0 },
  );
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
          <th className="px-4 py-3 sm:px-5">Name</th>
          <th className="px-4 py-3">Hours</th>
          <th className="px-4 py-3">Billable hours</th>
          {!hideAmount && <th className="px-4 py-3 text-right sm:px-5">Billable amount</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const billablePct = t.hours > 0 ? Math.round((t.billableHours / t.hours) * 100) : 0;
          return (
            <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-bg/60">
              <td className="px-4 py-3 sm:px-5">
                <span className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
                  <span className="font-medium text-text">{t.name}</span>
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    to={hoursLink({ task_id: t.id })}
                    className="font-semibold text-primary hover:underline"
                  >
                    {formatHours(t.hours)}
                  </Link>
                  <BarMini value={t.hours > 0 ? t.billableHours / t.hours : 0} />
                </div>
              </td>
              <td className="px-4 py-3 text-text">
                {formatHours(t.billableHours)} <span className="text-muted">({billablePct}%)</span>
              </td>
              {!hideAmount && (
                <td className="px-4 py-3 text-right font-semibold text-text sm:px-5">
                  {formatCurrency(t.billableAmount)}
                </td>
              )}
            </tr>
          );
        })}
        <tr className="bg-bg/40 font-semibold">
          <td className="px-4 py-3 sm:px-5">Total</td>
          <td className="px-4 py-3">{formatHours(total.hours)}</td>
          <td className="px-4 py-3">{formatHours(total.billable)}</td>
          {!hideAmount && (
            <td className="px-4 py-3 text-right sm:px-5">{formatCurrency(total.amount)}</td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

function TeamTable({
  rows,
  hoursLink,
  hideAmount,
}: {
  rows: TeamView[];
  hoursLink: HoursLinkBuilder;
  hideAmount?: boolean;
}) {
  if (rows.length === 0) return <EmptyTimeRow />;
  const total = rows.reduce(
    (acc, m) => ({
      hours: acc.hours + m.hours,
      billable: acc.billable + m.billableHours,
      amount: acc.amount + m.billableAmount,
    }),
    { hours: 0, billable: 0, amount: 0 },
  );
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
          <th className="px-4 py-3 sm:px-5">Name</th>
          <th className="px-4 py-3">Hours</th>
          <th className="px-4 py-3">Utilization</th>
          <th className="px-4 py-3">Billable hours</th>
          {!hideAmount && <th className="px-4 py-3 text-right sm:px-5">Billable amount</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => {
          const billablePct = m.hours > 0 ? Math.round((m.billableHours / m.hours) * 100) : 0;
          return (
            <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-bg/60">
              <td className="px-4 py-3 sm:px-5">
                <span className="flex items-center gap-2.5">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                    {m.initials}
                  </span>
                  <span className="font-medium text-text">{m.name}</span>
                </span>
              </td>
              <td className="px-4 py-3">
                <Link
                  to={hoursLink({ user_id: m.id })}
                  className="font-semibold text-primary hover:underline"
                >
                  {formatHours(m.hours)}
                </Link>
              </td>
              <td className="px-4 py-3 text-text">{m.utilization}%</td>
              <td className="px-4 py-3 text-text">
                {formatHours(m.billableHours)} <span className="text-muted">({billablePct}%)</span>
              </td>
              {!hideAmount && (
                <td className="px-4 py-3 text-right font-semibold text-text sm:px-5">
                  {formatCurrency(m.billableAmount)}
                </td>
              )}
            </tr>
          );
        })}
        <tr className="bg-bg/40 font-semibold">
          <td className="px-4 py-3 sm:px-5">Total</td>
          <td className="px-4 py-3">{formatHours(total.hours)}</td>
          <td className="px-4 py-3" />
          <td className="px-4 py-3">{formatHours(total.billable)}</td>
          {!hideAmount && (
            <td className="px-4 py-3 text-right sm:px-5">{formatCurrency(total.amount)}</td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

function EmptyTimeRow() {
  return (
    <div className="px-5 py-12 text-center text-sm text-muted">
      No time tracked in this period yet.
    </div>
  );
}

function DrilldownProjectsTable({
  rows,
  totalHours,
  onDrill,
  hoursLink,
  hideAmount,
}: {
  rows: ProjectView[];
  totalHours: number;
  onDrill?: (id: number) => void;
  hoursLink: HoursLinkBuilder;
  hideAmount?: boolean;
}) {
  const totalBillable = rows.reduce((acc, r) => acc + r.billableHours, 0);
  const totalAmount = rows.reduce((acc, r) => acc + r.billableAmount, 0);
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
          <th className="px-4 py-3 sm:px-5">Name</th>
          <th className="px-4 py-3">Hours</th>
          <th className="px-4 py-3">Billable hours</th>
          {!hideAmount && <th className="px-4 py-3 text-right sm:px-5">Billable amount</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const billablePct = p.hours > 0 ? Math.round((p.billableHours / p.hours) * 100) : 0;
          return (
            <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-bg/60">
              <td className="px-4 py-3 sm:px-5">
                {onDrill ? (
                  <button
                    type="button"
                    onClick={() => onDrill(p.id)}
                    className="font-semibold text-primary hover:underline"
                  >
                    {p.name}
                  </button>
                ) : (
                  <span className="font-semibold text-primary hover:underline">{p.name}</span>
                )}
                {p.type ? (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-muted">
                    {p.type}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    to={hoursLink({ project_id: p.id })}
                    className="font-semibold text-primary hover:underline"
                  >
                    {formatHours(p.hours)}
                  </Link>
                  <BarMini value={p.hours > 0 ? p.billableHours / p.hours : 0} />
                </div>
              </td>
              <td className="px-4 py-3 text-text">
                {formatHours(p.billableHours)} <span className="text-muted">({billablePct}%)</span>
              </td>
              {!hideAmount && (
                <td className="px-4 py-3 text-right font-semibold text-text sm:px-5">
                  {formatCurrency(p.billableAmount)}
                </td>
              )}
            </tr>
          );
        })}
        <tr className="bg-bg/40 font-semibold">
          <td className="px-4 py-3 sm:px-5">Total</td>
          <td className="px-4 py-3">{formatHours(totalHours)}</td>
          <td className="px-4 py-3">{formatHours(totalBillable)}</td>
          {!hideAmount && (
            <td className="px-4 py-3 text-right sm:px-5">{formatCurrency(totalAmount)}</td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

function ProjectTaskBreakdownTable({
  rows,
  loading,
  hoursLink,
  hideAmount,
}: {
  rows: TaskBreakdownRow[];
  loading: boolean;
  hoursLink: HoursLinkBuilder;
  hideAmount?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (taskId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="px-5 py-12 text-center text-sm text-muted">Loading task breakdown…</div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-muted">
        No time tracked on this project in the selected period.
      </div>
    );
  }

  const totals = rows.reduce(
    (acc, r) => ({
      hours: acc.hours + (Number.parseFloat(r.hours) || 0),
      billable: acc.billable + (Number.parseFloat(r.billable_hours) || 0),
      amount: acc.amount + r.members.reduce(
        (sum, m) => sum + (Number.parseFloat(m.billable_amount) || 0),
        0,
      ),
    }),
    { hours: 0, billable: 0, amount: 0 },
  );

  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
          <th className="px-4 py-3 sm:px-5">Name</th>
          <th className="px-4 py-3">Hours</th>
          <th className="px-4 py-3">Billable hours</th>
          {!hideAmount && <th className="px-4 py-3">Rate</th>}
          {!hideAmount && <th className="px-4 py-3 text-right sm:px-5">Billable amount</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((task) => {
          const isOpen = expanded.has(task.id);
          const taskAmount = task.members.reduce(
            (sum, m) => sum + (Number.parseFloat(m.billable_amount) || 0),
            0,
          );
          return (
            <Fragment key={task.id}>
              <tr className="border-b border-slate-100 hover:bg-bg/60">
                <td className="px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={() => toggle(task.id)}
                    className="inline-flex items-center gap-2 font-semibold text-text hover:text-primary"
                  >
                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                    <span className="inline-block h-3 w-3 rounded-sm bg-accent" />
                    {task.name}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      to={hoursLink({ task_id: task.id })}
                      className="font-semibold text-primary hover:underline"
                    >
                      {formatHours(Number.parseFloat(task.hours) || 0)}
                    </Link>
                    <BarMini
                      value={
                        Number.parseFloat(task.hours) > 0
                          ? Number.parseFloat(task.billable_hours) /
                            Number.parseFloat(task.hours)
                          : 0
                      }
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-text">
                  {formatHours(Number.parseFloat(task.billable_hours) || 0)}{' '}
                  <span className="text-muted">({task.billable_percent}%)</span>
                </td>
                {!hideAmount && <td className="px-4 py-3 text-text">—</td>}
                {!hideAmount && (
                  <td className="px-4 py-3 text-right font-semibold text-text sm:px-5">
                    {formatCurrency(taskAmount)}
                  </td>
                )}
              </tr>
              {isOpen
                ? task.members.map((m) => (
                    <tr key={`${task.id}-${m.user_id}`} className="border-b border-slate-50 bg-bg/30">
                      <td className="px-4 py-3 pl-12 sm:px-5 sm:pl-14">
                        <span className="flex items-center gap-2.5">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                            {m.initials}
                          </span>
                          <span className="font-medium text-text">{m.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={hoursLink({ task_id: task.id, user_id: m.user_id })}
                          className="font-semibold text-primary hover:underline"
                        >
                          {formatHours(Number.parseFloat(m.hours) || 0)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text">
                        {formatHours(Number.parseFloat(m.billable_hours) || 0)}{' '}
                        <span className="text-muted">({m.billable_percent}%)</span>
                      </td>
                      {!hideAmount && (
                        <td className="px-4 py-3 text-text">
                          {formatCurrency(m.rate || '0')}
                        </td>
                      )}
                      {!hideAmount && (
                        <td className="px-4 py-3 text-right text-text sm:px-5">
                          {formatCurrency(m.billable_amount || '0')}
                        </td>
                      )}
                    </tr>
                  ))
                : null}
            </Fragment>
          );
        })}
        <tr className="bg-bg/40 font-semibold">
          <td className="px-4 py-3 sm:px-5">Total</td>
          <td className="px-4 py-3">{formatHours(totals.hours)}</td>
          <td className="px-4 py-3">{formatHours(totals.billable)}</td>
          {!hideAmount && <td className="px-4 py-3" />}
          {!hideAmount && (
            <td className="px-4 py-3 text-right sm:px-5">{formatCurrency(totals.amount)}</td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

function BarMini({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-primary-soft sm:inline-block">
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${pct * 100}%` }}
      />
    </span>
  );
}
