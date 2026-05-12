import { AlertTriangle, ChevronRight, Download, Save, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import KpiCard from '@/components/reports/KpiCard';
import PeriodSelector, { type Period } from '@/components/reports/PeriodSelector';
import { computeRange, formatRangeLabel, nudgeAnchor } from '@/components/reports/dateRange';
import { useFiscalYearStartMonth, useWeekStart } from '@/utils/preferences';
import { downloadCsv, timestampedFilename } from '@/components/reports/csvExport';
import SaveReportModal from '@/components/reports/SaveReportModal';
import { formatMoney } from '@/components/reports/reportFormat';
import { listTeam } from '@/api/users';
import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import type { TeamMember } from '@/types';
import {
  createSavedReport,
  getProfitabilityReport,
  type ProfitabilityReport,
  type ProfitabilityRow as ApiProfitabilityRow,
} from '@/api/reports';
import {
  PROFIT_CLIENTS,
  PROFIT_PROJECTS,
  PROFIT_TASKS,
  PROFIT_TEAM,
  PROFIT_TOTALS,
  PROFIT_TREND,
  type ProfitabilityRow,
} from '@/mock/reportsData';

function apiRowToView(r: ApiProfitabilityRow): ProfitabilityRow {
  const revenue = Number.parseFloat(r.revenue) || 0;
  const cost = Number.parseFloat(r.cost) || 0;
  const profit = Number.parseFloat(r.profit) || 0;
  return {
    id: r.id ?? 0,
    name: r.name || '—',
    client: r.client || undefined,
    type:
      r.type === 'Time & Materials' || r.type === 'Fixed Fee' || r.type === 'Non-Billable'
        ? r.type
        : undefined,
    revenue,
    cost,
    profit,
    margin: r.margin,
    returnOnCost: r.return_on_cost,
    hasMissingData: r.has_missing_data,
  };
}

type SubView = 'clients' | 'projects' | 'team' | 'tasks';

interface TrendPoint {
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

// Split the active range into bins for the trend chart, based on the selected period:
// - week / semimonth / month → 1 bin (the window itself)
// - quarter → up to 3 monthly bins
// - year → up to 12 monthly bins
// - all_time → 1 bin (range is unbounded; bucketing would be unbounded too)
// - custom → 1 bin if ≤ 31 days, else monthly bins capped at 12
function computeChartBins(
  period: Period,
  range: { start: string; end: string },
): { start: string; end: string; label: string }[] {
  const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const singleBin = () => [{
    start: range.start,
    end: range.end,
    label: formatRangeLabel(range.start, range.end),
  }];

  if (period === 'week' || period === 'semimonth' || period === 'month' || period === 'all_time') {
    return singleBin();
  }

  if (period === 'custom') {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days <= 31) return singleBin();
  }

  // Monthly bins between start and end, clipped to the actual window.
  const bins: { start: string; end: string; label: string }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end && bins.length < 12) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const binStart = monthStart < start ? start : monthStart;
    const binEnd = monthEnd > end ? end : monthEnd;
    bins.push({
      start: iso(binStart),
      end: iso(binEnd),
      label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return bins.length > 0 ? bins : singleBin();
}

const SUB_VIEWS: { key: SubView; label: string }[] = [
  { key: 'clients', label: 'Clients' },
  { key: 'projects', label: 'Projects' },
  { key: 'team', label: 'Team' },
  { key: 'tasks', label: 'Tasks' },
];

type ProjectStatusFilter = '' | 'active' | 'archived';
type ProjectTypeFilter = '' | 'time_materials' | 'fixed_fee' | 'non_billable';

const PROJECT_STATUS_OPTIONS: { value: ProjectStatusFilter; label: string }[] = [
  { value: '', label: 'All projects' },
  { value: 'active', label: 'Active only' },
  { value: 'archived', label: 'Archived only' },
];

const PROJECT_TYPE_OPTIONS: { value: ProjectTypeFilter; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'time_materials', label: 'Time & Materials' },
  { value: 'fixed_fee', label: 'Fixed Fee' },
  { value: 'non_billable', label: 'Non-Billable' },
];

export default function ProfitabilityReportPage() {
  // Subscribe to currency + number_format so the page re-renders when the user
  // changes them in Settings → Preferences. The values themselves are read by
  // formatMoney() from the same store; we only need the subscription here.
  useAccountSettingsStore((s) => s.settings?.currency);
  useAccountSettingsStore((s) => s.settings?.number_format);

  const [period, setPeriod] = useState<Period>('quarter');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [subView, setSubView] = useState<SubView>('clients');
  const [drilldownClientId, setDrilldownClientId] = useState<number | null>(null);
  const [drilldownProjectId, setDrilldownProjectId] = useState<number | null>(null);
  const [drilldownSubView, setDrilldownSubView] = useState<'projects' | 'tasks' | 'team'>('projects');
  const [report, setReport] = useState<ProfitabilityReport | null>(null);
  const [clientReport, setClientReport] = useState<ProfitabilityReport | null>(null);
  const [projectReport, setProjectReport] = useState<ProfitabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [projectStatus, setProjectStatus] = useState<ProjectStatusFilter>('');
  const [projectType, setProjectType] = useState<ProjectTypeFilter>('');
  const [projectManagerId, setProjectManagerId] = useState<string>('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[] | null>(null);

  // Load potential project managers for the dropdown.
  useEffect(() => {
    let cancelled = false;
    listTeam()
      .then((list) => {
        if (!cancelled) setTeam(list);
      })
      .catch(() => {
        if (!cancelled) setTeam([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const weekStartsOn = useWeekStart();
  const fiscalStartMonth = useFiscalYearStartMonth();
  // Custom date pickers — default to current month so "Custom" starts sensibly.
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
    getProfitabilityReport({
      start: range.start,
      end: range.end,
      project_status: projectStatus || undefined,
      project_type: projectType || undefined,
      project_manager_id: projectManagerId ? Number.parseInt(projectManagerId, 10) : undefined,
    })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('Profitability report fetch failed; falling back to mock', err);
          setLoadError('Could not load live data — showing sample.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, isAllTime, projectStatus, projectType, projectManagerId]);

  // Fetch the client-scoped report when user drills into a client.
  useEffect(() => {
    if (drilldownClientId == null) {
      setClientReport(null);
      return;
    }
    let cancelled = false;
    getProfitabilityReport({
      start: range.start,
      end: range.end,
      project_status: projectStatus || undefined,
      project_type: projectType || undefined,
      project_manager_id: projectManagerId ? Number.parseInt(projectManagerId, 10) : undefined,
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
  }, [
    drilldownClientId, range.start, range.end, isAllTime,
    projectStatus, projectType, projectManagerId,
  ]);

  // Fetch the project-scoped report when user drills into a project.
  useEffect(() => {
    if (drilldownProjectId == null) {
      setProjectReport(null);
      return;
    }
    let cancelled = false;
    getProfitabilityReport({
      start: range.start,
      end: range.end,
      project_status: projectStatus || undefined,
      project_type: projectType || undefined,
      project_manager_id: projectManagerId ? Number.parseInt(projectManagerId, 10) : undefined,
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
  }, [
    drilldownProjectId, range.start, range.end, isAllTime,
    projectStatus, projectType, projectManagerId,
  ]);

  // Reset drilldown sub-view defaults when level changes
  useEffect(() => {
    if (drilldownProjectId !== null) setDrilldownSubView('tasks');
    else if (drilldownClientId !== null) setDrilldownSubView('projects');
  }, [drilldownClientId, drilldownProjectId]);

  // Trend chart: fetch profitability totals for each bin within the active window
  // so the chart reflects the same filters as the rest of the page.
  useEffect(() => {
    if (isAllTime) {
      setTrendData(null);
      return;
    }
    let cancelled = false;
    const bins = computeChartBins(period, range);
    if (bins.length === 0) {
      setTrendData([]);
      return;
    }
    Promise.all(
      bins.map((bin) =>
        getProfitabilityReport({
          start: bin.start,
          end: bin.end,
          project_status: projectStatus || undefined,
          project_type: projectType || undefined,
          project_manager_id: projectManagerId ? Number.parseInt(projectManagerId, 10) : undefined,
          client_id: drilldownClientId ?? undefined,
          project_id: drilldownProjectId ?? undefined,
        })
          .then((data) => ({
            label: bin.label,
            revenue: Number.parseFloat(data.totals.revenue) || 0,
            cost: Number.parseFloat(data.totals.cost) || 0,
            profit: Number.parseFloat(data.totals.profit) || 0,
          }))
          .catch(() => ({
            label: bin.label,
            revenue: 0,
            cost: 0,
            profit: 0,
          })),
      ),
    ).then((points) => {
      if (!cancelled) setTrendData(points);
    });
    return () => {
      cancelled = true;
    };
  }, [
    period, range.start, range.end, isAllTime,
    projectStatus, projectType, projectManagerId,
    drilldownClientId, drilldownProjectId,
  ]);

  const canNudge = !['all_time', 'custom'].includes(period);
  const handlePrev = canNudge ? () => setAnchor((a) => nudgeAnchor(a, period, -1)) : undefined;
  const handleNext = canNudge ? () => setAnchor((a) => nudgeAnchor(a, period, 1)) : undefined;
  const rangeLabel = isAllTime ? 'All time' : formatRangeLabel(range.start, range.end);

  // Active report = whichever level the user is currently viewing.
  const activeReport: ProfitabilityReport | null = projectReport ?? clientReport ?? report;

  const apiClients = useMemo(
    () => (activeReport ? activeReport.clients.map(apiRowToView) : null),
    [activeReport],
  );
  const apiProjects = useMemo(
    () => (activeReport ? activeReport.projects.map(apiRowToView) : null),
    [activeReport],
  );
  const apiTeam = useMemo(
    () => (activeReport ? activeReport.team.map(apiRowToView) : null),
    [activeReport],
  );
  const apiTasks = useMemo(
    () => (activeReport ? activeReport.tasks.map(apiRowToView) : null),
    [activeReport],
  );

  // Find drilldown context in the top-level report so breadcrumbs have names.
  const drilldownClient = useMemo(() => {
    if (drilldownClientId == null) return null;
    const fromTop = report?.clients.find((c) => c.id === drilldownClientId);
    return fromTop ? apiRowToView(fromTop) : null;
  }, [drilldownClientId, report]);

  const drilldownProject = useMemo(() => {
    if (drilldownProjectId == null) return null;
    // Look in clientReport first (more scoped), then top report.
    const fromClient = clientReport?.projects.find((p) => p.id === drilldownProjectId);
    if (fromClient) return apiRowToView(fromClient);
    const fromTop = report?.projects.find((p) => p.id === drilldownProjectId);
    return fromTop ? apiRowToView(fromTop) : null;
  }, [drilldownProjectId, clientReport, report]);

  const isDrilldown = drilldownClientId !== null || drilldownProjectId !== null;

  // Choose which rows to display based on drilldown level + sub-view.
  const rows = useMemo(() => {
    if (drilldownProjectId !== null) {
      // Project drilldown: only Tasks / Team available
      return drilldownSubView === 'team'
        ? apiTeam ?? []
        : apiTasks ?? [];
    }
    if (drilldownClientId !== null) {
      // Client drilldown: Projects / Tasks / Team
      if (drilldownSubView === 'team') return apiTeam ?? [];
      if (drilldownSubView === 'tasks') return apiTasks ?? [];
      return apiProjects ?? [];
    }
    // Top-level
    return subView === 'clients'
      ? apiClients ?? PROFIT_CLIENTS
      : subView === 'projects'
        ? apiProjects ?? PROFIT_PROJECTS
        : subView === 'team'
          ? apiTeam ?? PROFIT_TEAM
          : apiTasks ?? PROFIT_TASKS;
  }, [
    drilldownClientId, drilldownProjectId, drilldownSubView,
    subView, apiClients, apiProjects, apiTeam, apiTasks,
  ]);

  const totals = activeReport
    ? {
        revenue: Number.parseFloat(activeReport.totals.revenue) || 0,
        cost: Number.parseFloat(activeReport.totals.cost) || 0,
        profit: Number.parseFloat(activeReport.totals.profit) || 0,
        marginPercent: activeReport.totals.margin_percent,
        revenueChange: 0,
        costChange: 0,
        profitChange: 0,
      }
    : PROFIT_TOTALS;

  const handleExportCsv = () => {
    const headers = ['Name', 'Client', 'Type', 'Hours', 'Revenue', 'Cost', 'Profit', 'Margin %', 'Return on cost %'];
    downloadCsv({
      filename: timestampedFilename(`profitability_${subView}`),
      headers,
      rows: rows.map((r) => [
        r.name,
        r.client ?? '',
        r.type ?? '',
        // Hours are not in the view rows for Profitability — leave blank.
        '',
        r.revenue.toFixed(2),
        r.cost.toFixed(2),
        r.profit.toFixed(2),
        r.margin,
        r.returnOnCost,
      ]),
    });
  };

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const handleSaveReport = async (name: string, isShared: boolean) => {
    await createSavedReport({
      name,
      kind: 'profitability',
      filters: { period, subView },
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
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-2xl font-bold text-text sm:text-3xl">
                  Profitability report
                </h2>
                <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
                  Administrators only
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Revenue, cost, and margin per client, project, and team.
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

        <div className="px-4 pb-4 pt-3 sm:px-6">
        {/* Show "loading" hint while fetching; only surface a banner when there's
            a real load error. The old always-on "missing dates and rates" banner
            was a placeholder with no real signal behind it and has been removed. */}
        {loading ? (
          <div className="mb-3 rounded-lg bg-bg/40 px-3 py-2 text-xs text-muted">Loading…</div>
        ) : loadError ? (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-text/80">{loadError}</p>
          </div>
        ) : null}

        {/* Filter dropdowns */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select
            value={projectStatus}
            onChange={(e) => setProjectStatus(e.target.value as ProjectStatusFilter)}
            className="input w-full py-2 hover:bg-slate-50 sm:w-auto"
          >
            {PROJECT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as ProjectTypeFilter)}
            className="input w-full py-2 hover:bg-slate-50 sm:w-auto"
          >
            {PROJECT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={projectManagerId}
            onChange={(e) => setProjectManagerId(e.target.value)}
            className="input w-full py-2 hover:bg-slate-50 sm:w-auto"
          >
            <option value="">All managers</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
          {(projectStatus || projectType || projectManagerId) ? (
            <button
              type="button"
              onClick={() => {
                setProjectStatus('');
                setProjectType('');
                setProjectManagerId('');
              }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>
        </div>
      </section>

      {/* Drilldown breadcrumb */}
      {isDrilldown ? (
        <nav className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setDrilldownClientId(null);
              setDrilldownProjectId(null);
            }}
            className="font-semibold text-primary hover:underline"
          >
            Profitability report
          </button>
          {drilldownClient ? (
            <>
              <ChevronRight className="h-4 w-4 text-muted" />
              <button
                type="button"
                onClick={() => setDrilldownProjectId(null)}
                className={
                  drilldownProject
                    ? 'font-semibold text-primary hover:underline'
                    : 'font-semibold text-text'
                }
              >
                {drilldownClient.name}
              </button>
            </>
          ) : null}
          {drilldownProject ? (
            <>
              <ChevronRight className="h-4 w-4 text-muted" />
              <span className="font-semibold text-text">{drilldownProject.name}</span>
            </>
          ) : null}
        </nav>
      ) : null}

      {/* SECTION 2 — Trend chart + KPIs */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-base font-bold text-text">
              {drilldownProject
                ? `${drilldownProject.name} — profit`
                : drilldownClient
                  ? `${drilldownClient.name} — profit`
                  : 'Company profit over this period'}
            </h3>
            <p className="text-sm text-muted">Tracked time</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <LegendDot color="#10B981" label="Revenue" />
            <LegendDot color="#EF4444" label="Costs" />
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-primary" />
              <span className="text-muted">Profit</span>
            </span>
          </div>
        </div>
        <div className="mt-4">
          <ProfitTrendChart
            data={
              trendData ??
              (activeReport
                ? [
                    {
                      label: rangeLabel,
                      revenue: Number.parseFloat(activeReport.totals.revenue) || 0,
                      cost: Number.parseFloat(activeReport.totals.cost) || 0,
                      profit: Number.parseFloat(activeReport.totals.profit) || 0,
                    },
                  ]
                : null)
            }
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="Revenue"
            value={formatMoney(totals.revenue)}
            trend={{ value: totals.revenueChange }}
            sublabel="Billable hours × project rate"
          />
          <KpiCard
            label="Cost"
            value={formatMoney(totals.cost)}
            trend={{ value: totals.costChange }}
            sublabel="Hours × user cost rate"
          />
          <KpiCard
            label={`Profit (${totals.marginPercent}%)`}
            value={formatMoney(totals.profit)}
            trend={{ value: totals.profitChange }}
            tone="positive"
          />
        </div>
      </section>

      {/* SECTION 3 — Profitability table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1 overflow-x-auto">
            {drilldownProjectId !== null
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
              : drilldownClientId !== null
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
                      onClick={() => setSubView(tab.key)}
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
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn-outline w-full justify-center gap-2 px-3 py-1.5 text-xs sm:w-auto"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>

        <div className="overflow-x-auto">
          <ProfitabilityTable
            rows={rows}
            subView={
              drilldownProjectId !== null
                ? drilldownSubView === 'team' ? 'team' : 'tasks'
                : drilldownClientId !== null
                  ? drilldownSubView === 'team'
                    ? 'team'
                    : drilldownSubView === 'tasks'
                      ? 'tasks'
                      : 'projects'
                  : subView
            }
            onClickClient={
              drilldownClientId === null
                ? (id) => {
                    setDrilldownClientId(id);
                    setDrilldownProjectId(null);
                  }
                : undefined
            }
            onClickProject={(id) => setDrilldownProjectId(id)}
          />
        </div>
      </section>

      <SaveReportModal
        open={saveModalOpen}
        defaultName="My profitability report"
        onCancel={() => setSaveModalOpen(false)}
        onSave={handleSaveReport}
      />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-muted">{label}</span>
    </span>
  );
}

function ProfitTrendChart({ data }: { data: TrendPoint[] | null }) {
  const width = 720;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 32, left: 88 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const points = data ?? PROFIT_TREND;
  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-xs text-muted">
        No data in the selected window.
      </div>
    );
  }

  const rawMax = Math.max(...points.flatMap((d) => [d.revenue, d.cost, d.profit, 0]));
  const max = rawMax > 0 ? rawMax * 1.15 : 1;
  const min = 0;
  const groupW = innerW / points.length;
  const barW = Math.min(36, groupW / 3);

  const yFor = (v: number) => padding.top + innerH - ((v - min) / (max - min)) * innerH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const y = padding.top + innerH * t;
    const value = max * (1 - t);
    return { y, value };
  });

  const profitPoints = points.map((d, i) => {
    const cx = padding.left + groupW * i + groupW / 2;
    const cy = yFor(d.profit);
    return { cx, cy };
  });

  // X-axis labels arrive as "MMM YYYY" (e.g. "Jan 2026"). When every bin shares
  // the same year — which is always true for the year period and usually for
  // quarter — drop the redundant year suffix so 12 monthly labels fit without
  // overlapping at this width. The active year is already shown in the period
  // header above the chart.
  const yearMatches = points.map((p) => p.label.match(/\s(\d{4})$/)?.[1]);
  const sameYear =
    yearMatches.every((y) => y && y === yearMatches[0]) && yearMatches[0] !== undefined;
  const displayLabel = (label: string) =>
    sameYear ? label.replace(/\s\d{4}$/, '') : label;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label="Profit trend">
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padding.left} x2={width - padding.right} y1={g.y} y2={g.y} stroke="#E5E7EB" strokeDasharray="3 3" />
          <text x={padding.left - 8} y={g.y + 4} fontSize="13" textAnchor="end" fill="#6B778C">
            {formatMoney(g.value)}
          </text>
        </g>
      ))}

      {points.map((d, i) => {
        const groupX = padding.left + groupW * i;
        const center = groupX + groupW / 2;
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={center - barW - 2}
              y={yFor(d.revenue)}
              width={barW}
              height={padding.top + innerH - yFor(d.revenue)}
              fill="#10B981"
              rx={2}
            />
            <rect
              x={center + 2}
              y={yFor(d.cost)}
              width={barW}
              height={padding.top + innerH - yFor(d.cost)}
              fill="#EF4444"
              rx={2}
            />
            <text x={center} y={height - 8} fontSize="11" textAnchor="middle" fill="#6B778C">
              {displayLabel(d.label)}
            </text>
          </g>
        );
      })}

      <polyline
        fill="none"
        stroke="#0052CC"
        strokeWidth={2}
        points={profitPoints.map((p) => `${p.cx},${p.cy}`).join(' ')}
      />
      {profitPoints.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={4} fill="#FFFFFF" stroke="#0052CC" strokeWidth={2} />
      ))}
    </svg>
  );
}

function ProfitabilityTable({
  rows,
  subView,
  onClickClient,
  onClickProject,
}: {
  rows: ProfitabilityRow[];
  subView: SubView;
  onClickClient?: (id: number) => void;
  onClickProject?: (id: number) => void;
}) {
  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
    }),
    { revenue: 0, cost: 0, profit: 0 },
  );
  const totalMargin = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 100) : 0;
  const totalRoc = totals.cost > 0 ? Math.round((totals.profit / totals.cost) * 100) : 0;

  const showSecondaryColumn = subView === 'projects';
  const handler =
    subView === 'clients' ? onClickClient : subView === 'projects' ? onClickProject : undefined;

  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
          <th className="px-4 py-3 sm:px-5">Name</th>
          {showSecondaryColumn ? <th className="hidden px-4 py-3 md:table-cell">Client</th> : null}
          <th className="px-4 py-3 text-right">Revenue</th>
          <th className="px-4 py-3 text-right">Cost</th>
          <th className="px-4 py-3 text-right">Profit</th>
          <th className="px-4 py-3 text-right">Margin</th>
          <th className="hidden px-4 py-3 text-right sm:table-cell sm:px-5">Return on cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const profitPositive = r.profit >= 0;
          const isClickable = !!handler && r.id !== 0;
          return (
            <tr
              key={r.id}
              className={`border-b border-slate-100 last:border-0 hover:bg-bg/60 ${
                r.hasMissingData ? 'bg-warning/5' : ''
              }`}
            >
              <td className="px-4 py-3 sm:px-5">
                <span className="flex flex-wrap items-center gap-2">
                  {r.hasMissingData ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                  ) : null}
                  {isClickable ? (
                    <button
                      type="button"
                      onClick={() => handler && handler(r.id)}
                      className="font-semibold text-primary hover:underline"
                    >
                      {r.name}
                    </button>
                  ) : (
                    <span className="font-semibold text-text">{r.name}</span>
                  )}
                  {r.type ? (
                    <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-muted sm:inline-block">
                      {r.type}
                    </span>
                  ) : null}
                </span>
              </td>
              {showSecondaryColumn ? (
                <td className="hidden px-4 py-3 text-text md:table-cell">{r.client}</td>
              ) : null}
              <td className="px-4 py-3 text-right text-text">{formatMoney(r.revenue)}</td>
              <td className="px-4 py-3 text-right text-text">{formatMoney(r.cost)}</td>
              <td className={`px-4 py-3 text-right font-semibold ${profitPositive ? 'text-text' : 'text-danger'}`}>
                {formatMoney(r.profit)}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <MarginBar value={r.margin} />
                  <span className={`w-10 text-right text-xs font-semibold ${profitPositive ? 'text-text' : 'text-danger'}`}>
                    {r.margin}%
                  </span>
                </div>
              </td>
              <td
                className={`hidden px-4 py-3 text-right text-xs font-semibold sm:table-cell sm:px-5 ${
                  r.returnOnCost >= 0 ? 'text-text' : 'text-danger'
                }`}
              >
                {r.returnOnCost}%
              </td>
            </tr>
          );
        })}
        <tr className="bg-bg/40 font-semibold">
          <td className="px-4 py-3 sm:px-5">Total</td>
          {showSecondaryColumn ? <td className="hidden md:table-cell" /> : null}
          <td className="px-4 py-3 text-right">{formatMoney(totals.revenue)}</td>
          <td className="px-4 py-3 text-right">{formatMoney(totals.cost)}</td>
          <td className="px-4 py-3 text-right">{formatMoney(totals.profit)}</td>
          <td className="px-4 py-3 text-right">{totalMargin}%</td>
          <td className="hidden px-4 py-3 text-right sm:table-cell sm:px-5">{totalRoc}%</td>
        </tr>
      </tbody>
    </table>
  );
}

function MarginBar({ value }: { value: number }) {
  const positive = value >= 0;
  const width = Math.min(100, Math.abs(value));
  return (
    <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-slate-100 sm:inline-block">
      <span
        className={`block h-full rounded-full ${positive ? 'bg-primary' : 'bg-danger'}`}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}
