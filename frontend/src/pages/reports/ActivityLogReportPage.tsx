import { ChevronDown, Download, History, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import PeriodSelector, { type Period } from '@/components/reports/PeriodSelector';
import { computeRange, formatRangeLabel, nudgeAnchor } from '@/components/reports/dateRange';
import { useFiscalYearStartMonth, useWeekStart } from '@/utils/preferences';
import { downloadCsv, timestampedFilename } from '@/components/reports/csvExport';
import MultiSelectDropdown from '@/components/reports/MultiSelectDropdown';
import SaveReportModal from '@/components/reports/SaveReportModal';
import { useAuthStore } from '@/store/authStore';
import {
  createSavedReport,
  getActivityLog,
  type ActivityEvent,
  type ActivityLogReport,
  type ActivityType,
} from '@/api/reports';

type SubTab = 'timesheet' | 'approval' | 'project';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'timesheet', label: 'Timesheets' },
  { key: 'approval', label: 'Approvals' },
  { key: 'project', label: 'Projects' },
];

// Coarse grouping for the "Event types" dropdown — subset of activity strings the
// backend currently emits.
const EVENT_TYPE_OPTIONS: Record<SubTab, { value: string; label: string }[]> = {
  timesheet: [
    { value: 'tracked', label: 'Tracked time' },
  ],
  approval: [
    { value: 'submitted', label: 'Submitted' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ],
  project: [
    { value: 'created', label: 'Created project' },
  ],
};

function eventTypeOf(activity: string): string {
  const a = activity.toLowerCase();
  if (a.startsWith('tracked')) return 'tracked';
  if (a.startsWith('submitted')) return 'submitted';
  if (a.startsWith('approved')) return 'approved';
  if (a.startsWith('rejected')) return 'rejected';
  if (a.startsWith('created')) return 'created';
  return 'other';
}

export default function ActivityLogReportPage() {
  const currentUser = useAuthStore((s) => s.user);
  const canOpenUserDetail =
    currentUser?.role === 'owner' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'manager';
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [subTab, setSubTab] = useState<SubTab>('timesheet');
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [report, setReport] = useState<ActivityLogReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filter dropdown selections (multi-select, applied client-side)
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [taskFilter, setTaskFilter] = useState<string[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string[]>([]);
  const [ownedByFilter, setOwnedByFilter] = useState<string[]>([]);
  const [performedByFilter, setPerformedByFilter] = useState<string[]>([]);

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
    getActivityLog({
      type: subTab as ActivityType,
      start: range.start,
      end: range.end,
    })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('Activity log fetch failed', err);
          setLoadError('Could not load activity log.');
          setReport(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subTab, range.start, range.end, isAllTime]);

  // Reset filters that don't apply when the user switches sub-tab
  useEffect(() => {
    setEventTypeFilter([]);
  }, [subTab]);

  // Build dropdown options from currently-loaded events
  const allEvents = report?.events ?? [];
  const subTabEvents = useMemo(
    () => allEvents.filter((e) => e.type === subTab),
    [allEvents, subTab],
  );

  const clientOptions = uniqueOptions(subTabEvents.map((e) => e.client));
  const projectOptions = uniqueOptions(subTabEvents.map((e) => e.project));
  const taskOptions = uniqueOptions(subTabEvents.map((e) => e.task));
  const performedByOptions = uniqueOptions(subTabEvents.map((e) => e.performed_by));
  // "Owned by" — for now, mirror Performed by since we don't track ownership separately
  const ownedByOptions = performedByOptions;

  const events: ActivityEvent[] = useMemo(() => {
    let list = subTabEvents;
    if (approvedOnly && subTab === 'approval') {
      list = list.filter((e) => /approved/i.test(e.activity));
    }
    if (clientFilter.length > 0) list = list.filter((e) => clientFilter.includes(e.client));
    if (projectFilter.length > 0) list = list.filter((e) => projectFilter.includes(e.project));
    if (taskFilter.length > 0) list = list.filter((e) => taskFilter.includes(e.task));
    if (performedByFilter.length > 0)
      list = list.filter((e) => performedByFilter.includes(e.performed_by));
    if (ownedByFilter.length > 0)
      list = list.filter((e) => ownedByFilter.includes(e.performed_by));
    if (eventTypeFilter.length > 0)
      list = list.filter((e) => eventTypeFilter.includes(eventTypeOf(e.activity)));
    return list;
  }, [
    subTabEvents,
    subTab,
    approvedOnly,
    clientFilter,
    projectFilter,
    taskFilter,
    performedByFilter,
    ownedByFilter,
    eventTypeFilter,
  ]);

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    events.forEach((e) => {
      const arr = map.get(e.date_label) ?? [];
      arr.push(e);
      map.set(e.date_label, arr);
    });
    return Array.from(map.entries());
  }, [events]);

  const canNudge = !['all_time', 'custom'].includes(period);
  const handlePrev = canNudge ? () => setAnchor((a) => nudgeAnchor(a, period, -1)) : undefined;
  const handleNext = canNudge ? () => setAnchor((a) => nudgeAnchor(a, period, 1)) : undefined;
  const rangeLabel = isAllTime ? 'All time' : formatRangeLabel(range.start, range.end);

  const navigate = useNavigate();

  const handleExportCsv = () => {
    downloadCsv({
      filename: timestampedFilename(`activity_${subTab}`),
      headers: ['Date', 'Time', 'Activity', 'Hours', 'Client', 'Project', 'Task', 'Performed by'],
      rows: events.map((e) => [
        e.date_label,
        e.time_label,
        e.activity,
        e.hours ?? '',
        e.client,
        e.project,
        e.task,
        e.performed_by,
      ]),
    });
  };

  // Per-row Actions dropdown (single open at a time)
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const actionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (openActionId === null) return;
    const handler = (e: MouseEvent) => {
      if (actionRef.current && !actionRef.current.contains(e.target as Node)) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openActionId]);

  const goToSource = (event: ActivityEvent) => {
    setOpenActionId(null);
    if (event.type === 'timesheet') {
      navigate('/time');
    } else if (event.type === 'approval') {
      navigate('/approvals');
    } else if (event.type === 'project') {
      // We don't have the project id on the event; navigate to the projects list.
      navigate('/projects');
    }
  };

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const handleSaveReport = async (name: string, isShared: boolean) => {
    await createSavedReport({
      name,
      kind: 'activity',
      filters: { period, subTab, approvedOnly },
      is_shared: isShared,
    });
    setSaveModalOpen(false);
    setSaveFlash(`"${name}" saved. Open it from the Saved Reports tab.`);
    setTimeout(() => setSaveFlash(null), 4000);
  };

  const clearAllFilters = () => {
    setClientFilter([]);
    setProjectFilter([]);
    setTaskFilter([]);
    setEventTypeFilter([]);
    setOwnedByFilter([]);
    setPerformedByFilter([]);
  };

  const totalActiveFilters =
    clientFilter.length +
    projectFilter.length +
    taskFilter.length +
    eventTypeFilter.length +
    ownedByFilter.length +
    performedByFilter.length;

  return (
    <div className="space-y-5">
      {/* SECTION 1 — Header card: title + date nav + save action */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-2xl font-bold text-text sm:text-3xl">Activity log</h2>
              <p className="mt-0.5 text-xs text-muted">
                Timeline of timesheet, approval, and project events.
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6">
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
          {subTab === 'approval' ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={approvedOnly}
                onChange={(e) => setApprovedOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              Approved hours only
            </label>
          ) : null}
        </div>
        {saveFlash ? (
          <p className="mx-4 mb-3 rounded-md bg-accent-soft px-3 py-2 text-xs text-accent-dark sm:mx-6">
            {saveFlash}
          </p>
        ) : null}
        {loadError ? (
          <p className="mx-4 mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text/80 sm:mx-6">
            {loadError}
          </p>
        ) : null}
      </section>

      {/* SECTION 2 — Sub-tabs + filters */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 sm:px-5">
          <div className="flex items-center gap-1 overflow-x-auto">
            {SUB_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSubTab(tab.key)}
                className={`relative shrink-0 px-3 py-3 text-sm font-semibold transition ${
                  subTab === tab.key ? 'text-primary' : 'text-muted hover:text-text'
                }`}
              >
                {tab.label}
                {subTab === tab.key ? (
                  <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-sm bg-primary" />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <MultiSelectDropdown
              label="Clients"
              options={clientOptions}
              selected={clientFilter}
              onChange={setClientFilter}
            />
            <MultiSelectDropdown
              label="Projects"
              options={projectOptions}
              selected={projectFilter}
              onChange={setProjectFilter}
            />
            <MultiSelectDropdown
              label="Tasks"
              options={taskOptions}
              selected={taskFilter}
              onChange={setTaskFilter}
            />
            <MultiSelectDropdown
              label="Event types"
              options={EVENT_TYPE_OPTIONS[subTab]}
              selected={eventTypeFilter}
              onChange={setEventTypeFilter}
            />
            <MultiSelectDropdown
              label="Owned by"
              options={ownedByOptions}
              selected={ownedByFilter}
              onChange={setOwnedByFilter}
            />
            <MultiSelectDropdown
              label="Performed by"
              options={performedByOptions}
              selected={performedByFilter}
              onChange={setPerformedByFilter}
            />
            {totalActiveFilters > 0 ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Clear all
              </button>
            ) : null}
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              Show archived
            </label>
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

        {/* SECTION 3 — Results table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                <th className="px-4 py-3 sm:px-5">Time</th>
                <th className="px-3 py-3">Activity</th>
                <th className="hidden px-3 py-3 md:table-cell">Client</th>
                <th className="hidden px-3 py-3 md:table-cell">Project</th>
                <th className="hidden px-3 py-3 lg:table-cell">Task</th>
                <th className="px-4 py-3 sm:px-5">Performed by</th>
                <th className="px-4 py-3 sm:px-5"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted">
                    Loading…
                  </td>
                </tr>
              ) : grouped.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted">
                    {totalActiveFilters > 0
                      ? 'No activity matches the active filters.'
                      : 'No activity in the selected period.'}
                  </td>
                </tr>
              ) : (
                grouped.map(([date, items]) => (
                  <ActivityDayGroup
                    key={date}
                    date={date}
                    items={items}
                    openActionId={openActionId}
                    onToggleAction={(id) =>
                      setOpenActionId((cur) => (cur === id ? null : id))
                    }
                    onView={goToSource}
                    canOpenUserDetail={canOpenUserDetail}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <SaveReportModal
        open={saveModalOpen}
        defaultName="My activity log"
        onCancel={() => setSaveModalOpen(false)}
        onSave={handleSaveReport}
      />
    </div>
  );
}

function uniqueOptions(values: string[]): { value: string; label: string }[] {
  const set = new Set<string>();
  values.forEach((v) => {
    if (v && v.trim()) set.add(v);
  });
  return Array.from(set)
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));
}

function ActivityDayGroup({
  date,
  items,
  openActionId,
  onToggleAction,
  onView,
  canOpenUserDetail,
}: {
  date: string;
  items: ActivityEvent[];
  openActionId: string | null;
  onToggleAction: (id: string) => void;
  onView: (event: ActivityEvent) => void;
  canOpenUserDetail: boolean;
}) {
  return (
    <>
      <tr className="bg-bg/60 text-xs font-semibold uppercase tracking-wider text-muted">
        <td className="px-4 py-2 sm:px-5" colSpan={7}>
          {date}
        </td>
      </tr>
      {items.map((r) => {
        // Split the activity text so we can render the entry-date portion as a link.
        const entryLabel = r.entry_date_label;
        const activityHead =
          entryLabel && r.activity.endsWith(entryLabel)
            ? r.activity.slice(0, r.activity.length - entryLabel.length)
            : r.activity;
        const dateLink = r.entry_date ? `/time?date=${r.entry_date}` : null;
        return (
          <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-bg/40">
            <td className="px-4 py-3 text-xs font-semibold text-muted sm:px-5">{r.time_label}</td>
            <td className="px-3 py-3">
              <span className="block text-text">
                {activityHead}
                {entryLabel ? (
                  dateLink ? (
                    <Link
                      to={dateLink}
                      className="font-semibold text-primary hover:underline"
                    >
                      {entryLabel}
                    </Link>
                  ) : (
                    <span className="font-semibold text-text">{entryLabel}</span>
                  )
                ) : null}
              </span>
              {r.hours ? <span className="text-xs text-muted">{r.hours} hours</span> : null}
            </td>
            <td className="hidden px-3 py-3 text-text md:table-cell">{r.client}</td>
            <td className="hidden px-3 py-3 md:table-cell">
              {r.project ? (
                r.project_id ? (
                  <Link
                    to={`/projects/${r.project_id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {r.project}
                  </Link>
                ) : (
                  <span className="font-semibold text-primary">{r.project}</span>
                )
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>
            <td className="hidden px-3 py-3 text-text lg:table-cell">{r.task}</td>
            <td className="px-4 py-3 sm:px-5">
              {r.performed_by ? (
                r.performer_id && canOpenUserDetail ? (
                  <Link
                    to={`/team/${r.performer_id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {r.performed_by}
                  </Link>
                ) : (
                  <span className="font-semibold text-primary">{r.performed_by}</span>
                )
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>
          <td className="px-4 py-3 text-right sm:px-5">
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => onToggleAction(r.id)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-text transition hover:bg-slate-100"
              >
                Actions
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>
              {openActionId === r.id ? (
                <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-lg">
                  <button
                    type="button"
                    onClick={() => onView(r)}
                    className="block w-full px-3 py-2 text-left transition hover:bg-bg"
                  >
                    {r.type === 'timesheet'
                      ? 'Open Time tab'
                      : r.type === 'approval'
                        ? 'Open Approvals'
                        : 'Open Projects'}
                  </button>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
        );
      })}
    </>
  );
}
