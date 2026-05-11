import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Edit3 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { getTeamMember } from '@/api/users';
import { listTimeEntries } from '@/api/timeEntries';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import { formatRangeLabel, toIso } from '@/components/reports/dateRange';
import {
  formatHoursDisplay,
  getDayLabels,
  startOfWeek,
  useTimeDisplay,
  useWeekStart,
} from '@/utils/preferences';
import type { Role, TeamMemberDetail, TimeEntry } from '@/types';

const ROLE_BADGE: Record<Role, string> = {
  owner: 'bg-primary-soft text-primary',
  admin: 'bg-primary-soft text-primary',
  manager: 'bg-accent-soft text-accent-dark',
  member: 'bg-slate-100 text-muted',
};

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatDayHeader(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short' });
}

function isToday(d: Date): boolean {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

export default function TeamMemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const memberId = id ? Number.parseInt(id, 10) : NaN;
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  const weekStartsOn = useWeekStart();
  const timeDisplay = useTimeDisplay();
  const dayLabels = getDayLabels(weekStartsOn);

  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [member, setMember] = useState<TeamMemberDetail | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(weekAnchor, weekStartsOn), [weekAnchor, weekStartsOn]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekStartIso = toIso(weekStart);
  const weekEndIso = toIso(weekEnd);

  // Load the member once
  useEffect(() => {
    if (Number.isNaN(memberId)) {
      setLoadError('Invalid team member id');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTeamMember(memberId)
      .then((m) => {
        if (!cancelled) setMember(m);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(extractApiError(err, 'Failed to load team member'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  // Load entries on member load AND every week change
  useEffect(() => {
    if (Number.isNaN(memberId)) return;
    let cancelled = false;
    setEntriesLoading(true);
    listTimeEntries({
      user_id: memberId,
      start_date: weekStartIso,
      end_date: weekEndIso,
    })
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setEntriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, weekStartIso, weekEndIso]);

  const isThisWeek = useMemo(() => {
    const t = startOfWeek(new Date(), weekStartsOn);
    return toIso(t) === weekStartIso;
  }, [weekStartIso, weekStartsOn]);

  const fmtHrs = (n: number) => formatHoursDisplay(n, timeDisplay);

  const dayBuckets = useMemo(() => {
    const buckets: { date: Date; iso: string; entries: TimeEntry[]; total: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const iso = toIso(d);
      const dayEntries = entries.filter((e) => e.date === iso);
      const total = dayEntries.reduce((a, e) => a + (Number.parseFloat(e.hours) || 0), 0);
      buckets.push({ date: d, iso, entries: dayEntries, total });
    }
    return buckets;
  }, [entries, weekStart]);

  const totalHours = entries.reduce((a, e) => a + (Number.parseFloat(e.hours) || 0), 0);
  const billableHours = entries
    .filter((e) => e.is_billable)
    .reduce((a, e) => a + (Number.parseFloat(e.hours) || 0), 0);
  const nonBillableHours = totalHours - billableHours;

  const capacity = member ? Number.parseFloat(member.weekly_capacity_hours || '0') : 0;
  const capacityPct = capacity > 0 ? Math.min(100, (totalHours / capacity) * 100) : 0;
  const billableShare = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

  const projectsBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => {
      map.set(e.project_name, (map.get(e.project_name) ?? 0) + (Number.parseFloat(e.hours) || 0));
    });
    return Array.from(map.entries())
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);
  }, [entries]);

  const tasksBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => {
      map.set(e.task_name, (map.get(e.task_name) ?? 0) + (Number.parseFloat(e.hours) || 0));
    });
    return Array.from(map.entries())
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);
  }, [entries]);

  const projectsMax = projectsBreakdown[0]?.hours ?? 0;
  const tasksMax = tasksBreakdown[0]?.hours ?? 0;

  const initial = member
    ? (member.first_name?.[0] ?? member.email?.[0] ?? '?').toUpperCase()
    : '?';
  const roleLabel = member ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : '';
  const canEditProfile =
    !!currentUser &&
    (currentUser.role === 'owner' ||
      currentUser.role === 'admin' ||
      currentUser.id === memberId);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
          Loading…
        </div>
      </main>
    );
  }

  if (loadError || !member) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          to="/team"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Team
        </Link>
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
          {loadError || 'Team member not found'}
        </div>
      </main>
    );
  }

  const isSelf = !!currentUser && currentUser.id === memberId;
  const editProfileHref = isSelf ? '/profile' : `/team/${member.id}/edit`;

  return (
    <main className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link
        to="/team"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Team
      </Link>

      {/* Week navigator */}
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekAnchor((a) => addDays(a, -7))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-muted transition hover:bg-slate-50 hover:text-text"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekAnchor((a) => addDays(a, 7))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-muted transition hover:bg-slate-50 hover:text-text"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h1 className="font-heading text-2xl font-bold text-text">
          {isThisWeek ? 'This week: ' : ''}
          <span className="text-text">{formatRangeLabel(weekStartIso, weekEndIso)}</span>
        </h1>
      </div>

      {/* Identity card */}
      <section className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary font-heading text-lg font-bold text-white">
            {initial}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-xl font-bold text-text">
                {member.full_name || member.email}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  ROLE_BADGE[member.role]
                }`}
              >
                {roleLabel}
              </span>
              {isSelf ? (
                <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-dark">
                  You
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-muted">{member.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEditProfile ? (
            <button
              type="button"
              onClick={() => navigate(editProfileHref)}
              className="btn-outline gap-2 px-3 py-2 text-sm"
            >
              <Edit3 className="h-4 w-4" />
              Edit profile
            </button>
          ) : null}
        </div>
      </section>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* LEFT: breakdowns */}
        <aside className="space-y-4">
          {/* Total / Capacity */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Total hours
                </p>
                <p className="mt-1 font-heading text-2xl font-bold text-text">
                  {fmtHrs(totalHours)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Capacity
                </p>
                <p className="mt-1 font-heading text-2xl font-bold text-text">
                  {fmtHrs(capacity)}
                </p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="flex h-full">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(capacityPct * billableShare) / 100}%` }}
                />
                <div
                  className="h-full bg-primary-soft"
                  style={{ width: `${capacityPct - (capacityPct * billableShare) / 100}%` }}
                />
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              <li className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-text">
                  <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                  Billable
                </span>
                <span className="font-semibold text-text">{fmtHrs(billableHours)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-text">
                  <span className="h-2.5 w-2.5 rounded-sm bg-primary-soft" />
                  Non-billable
                </span>
                <span className="font-semibold text-text">{fmtHrs(nonBillableHours)}</span>
              </li>
            </ul>
          </div>

          {/* Day grid */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-7 gap-2 text-center">
              {dayBuckets.map((b, i) => {
                const today = isToday(b.date);
                return (
                  <div
                    key={b.iso}
                    className={`rounded-md px-1 py-2 ${
                      today ? 'bg-primary-soft' : ''
                    }`}
                  >
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wide ${
                        today ? 'text-primary' : 'text-muted'
                      }`}
                    >
                      {dayLabels[i]}
                    </p>
                    <p
                      className={`mt-1 text-sm font-bold ${
                        b.total > 0 ? 'text-text' : 'text-muted'
                      }`}
                    >
                      {fmtHrs(b.total)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Projects breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-heading text-sm font-bold text-text">Projects breakdown</h3>
            {projectsBreakdown.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No time tracked.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {projectsBreakdown.map((p) => (
                  <li key={p.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-2 truncate text-text">
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm bg-accent-dark" />
                        <span className="truncate">{p.name}</span>
                      </span>
                      <span className="font-semibold text-text">{fmtHrs(p.hours)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-accent-dark"
                        style={{
                          width: `${projectsMax > 0 ? (p.hours / projectsMax) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tasks breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-heading text-sm font-bold text-text">Tasks breakdown</h3>
            {tasksBreakdown.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No time tracked.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {tasksBreakdown.map((t) => (
                  <li key={t.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-2 truncate text-text">
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm bg-primary" />
                        <span className="truncate">{t.name || '—'}</span>
                      </span>
                      <span className="font-semibold text-text">{fmtHrs(t.hours)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${tasksMax > 0 ? (t.hours / tasksMax) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* RIGHT: per-day timesheet */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {entriesLoading ? (
            <div className="px-5 py-12 text-center text-sm text-muted">Loading…</div>
          ) : (
            dayBuckets.map((b) => (
              <DaySection
                key={b.iso}
                date={b.date}
                entries={b.entries}
                total={b.total}
                fmtHrs={fmtHrs}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function DaySection({
  date,
  entries,
  total,
  fmtHrs,
}: {
  date: Date;
  entries: TimeEntry[];
  total: number;
  fmtHrs: (n: number) => string;
}) {
  const today = isToday(date);
  return (
    <div className="border-b border-slate-200 last:border-0">
      <div
        className={`flex items-center justify-between border-l-4 px-5 py-2.5 text-xs font-bold uppercase tracking-wider ${
          today
            ? 'border-primary bg-primary-soft text-primary'
            : 'border-slate-300 bg-slate-100 text-text'
        }`}
      >
        <span>{formatDayHeader(date)}</span>
        {entries.length > 0 ? (
          <span className={today ? 'text-primary' : 'text-text'}>Total: {fmtHrs(total)}</span>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <div className="px-5 py-4 text-sm text-muted">No time tracked</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-4 px-5 py-3 hover:bg-slate-50/60"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-text">
                  {e.project_name}
                  <span className="ml-1 font-normal text-muted">({e.client_name})</span>
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {e.task_name}
                  {e.notes ? <span className="ml-2 text-text">— {e.notes}</span> : null}
                </p>
              </div>
              <div className="text-right">
                <p className="font-heading text-base font-bold text-text">
                  {fmtHrs(Number.parseFloat(e.hours) || 0)}
                </p>
                {e.is_billable ? (
                  <p className="text-xs text-accent-dark">Billable</p>
                ) : (
                  <p className="text-xs text-muted">Non-billable</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
