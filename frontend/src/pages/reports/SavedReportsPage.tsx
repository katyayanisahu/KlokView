import { Bookmark, ChevronDown, Folder, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useConfirm } from '@/components/ConfirmDialog';
import {
  deleteSavedReport,
  listSavedReports,
  type SavedReport,
  type SavedReportKind,
} from '@/api/reports';

type Filter = 'all' | 'mine' | 'shared';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All saved reports',
  mine: 'My reports',
  shared: 'Reports shared with me',
};

const KIND_META: Record<SavedReportKind, { label: string; to: string }> = {
  time: { label: 'Time', to: '/reports/time' },
  profitability: { label: 'Profitability', to: '/reports/profitability' },
  detailed_time: { label: 'Detailed Time', to: '/reports/detailed-time' },
  activity: { label: 'Activity Log', to: '/reports/activity-log' },
};

export default function SavedReportsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { confirmDialog, ask } = useConfirm();

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await listSavedReports();
        setReports(list);
      } catch {
        setLoadError('Could not load saved reports.');
        setReports([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (filter === 'mine') return reports.filter((r) => r.is_mine);
    if (filter === 'shared') return reports.filter((r) => !r.is_mine);
    return reports;
  }, [reports, filter]);

  const counts = useMemo(
    () => ({
      all: reports.length,
      mine: reports.filter((r) => r.is_mine).length,
      shared: reports.filter((r) => !r.is_mine).length,
    }),
    [reports],
  );

  const handleDelete = async (report: SavedReport) => {
    const ok = await ask({
      title: `Delete "${report.name}"?`,
      message: 'This removes the saved configuration. The underlying time data is unaffected.',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteSavedReport(report.id);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch {
      setLoadError('Could not delete report.');
    }
  };

  return (
    <div className="space-y-5">
      {confirmDialog}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Bookmark className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-2xl font-bold text-text sm:text-3xl">Saved reports</h2>
            <p className="mt-1 text-sm text-muted">
              Quickly re-open any report configuration you&apos;ve saved from the Time, Profitability,
              Detailed Time, or Activity Log tabs.
            </p>
          </div>
        </div>
        <div className="relative mt-4 block w-full sm:inline-block sm:w-auto" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-text transition hover:bg-slate-50 sm:inline-flex sm:w-auto sm:justify-start"
          >
            {FILTER_LABEL[filter]} ({counts[filter]})
            <ChevronDown className="h-4 w-4 text-muted" />
          </button>
          {open ? (
            <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg sm:right-auto sm:w-56">
              {(Object.keys(FILTER_LABEL) as Filter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setFilter(key);
                    setOpen(false);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-primary-soft/40 ${
                    key === filter ? 'bg-primary-soft/30 font-semibold text-primary' : 'text-text'
                  }`}
                >
                  {FILTER_LABEL[key]} ({counts[key]})
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {loadError ? (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text/80">
            {loadError}
          </p>
        ) : null}
      </section>

      {loading ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">
          Loading…
        </section>
      ) : filtered.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-bg p-8 text-center shadow-sm sm:p-12">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
            <Folder className="h-8 w-8 text-primary" />
          </span>
          <h3 className="mt-5 font-heading text-lg font-bold text-text">
            No saved or shared reports yet
          </h3>
          <p className="mt-2 text-sm text-muted">
            Save reports from any report page for quick access.
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-dark">
            <Bookmark className="h-3 w-3" />
            Use the Save report button on any tab
          </span>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                  <th className="px-4 py-3 sm:px-5">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Owner</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Updated</th>
                  <th className="px-4 py-3 sm:px-5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-bg/40">
                    <td className="px-4 py-3 sm:px-5">
                      <Link
                        to={KIND_META[r.kind]?.to ?? '/reports'}
                        className="font-semibold text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.is_shared ? (
                        <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-dark">
                          Shared
                        </span>
                      ) : null}
                      {/* Mobile-only: show owner + updated stacked under the name */}
                      <p className="mt-1 text-xs text-muted sm:hidden">
                        {r.is_mine ? 'You' : r.owner_name || '—'} ·{' '}
                        {new Date(r.updated_at).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-text">{KIND_META[r.kind]?.label ?? r.kind}</td>
                    <td className="hidden px-4 py-3 text-text sm:table-cell">
                      {r.is_mine ? 'You' : r.owner_name || '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-muted sm:table-cell">
                      {new Date(r.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      {r.is_mine ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-muted transition hover:border-danger/40 hover:bg-danger/5 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
