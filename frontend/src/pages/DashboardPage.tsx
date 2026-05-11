import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSearch,
  Lock,
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import PageHero from '@/components/PageHero';
import WeekBar from '@/components/WeekBar';
import { useConfirm } from '@/components/ConfirmDialog';
import { listProjects, listProjectTasks } from '@/api/projects';
import { listUsers } from '@/api/users';
import {
  disconnectOutlook,
  getOutlookStatus,
  markOutlookEventImported,
  startOutlookOAuth,
  type OutlookEvent,
  type OutlookStatus,
} from '@/api/integrations';
import OutlookEventPicker from '@/components/OutlookEventPicker';
import {
  formatHoursDisplay,
  startOfWeek as startOfWeekPref,
  getDayLabels,
  useTimerMode,
  useWeekStart,
} from '@/utils/preferences';
import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import type { WeekStart } from '@/api/accountSettings';
import {
  approveSubmission,
  createSubmission,
  listSubmissions,
  rejectSubmission,
  unapproveSubmission,
  withdrawSubmission,
} from '@/api/submissions';
import {
  createTimeEntry,
  deleteTimeEntry,
  getRunningEntry,
  listTimeEntries,
  resumeTimer,
  startTimer,
  stopTimer,
  updateTimeEntry,
} from '@/api/timeEntries';
import { emptyStateQuote } from '@/mock/dashboardData';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import type {
  ProjectListItem,
  ProjectTaskEntry,
  Role,
  Submission,
  TimeEntry,
  User,
} from '@/types';

type Tab = 'timesheet' | 'approval';
type View = 'day' | 'week';

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeek(reference: Date, weekStartsOn: WeekStart = 'monday'): Date {
  return startOfWeekPref(reference, weekStartsOn);
}

function buildWeekDays(
  reference: Date,
  hoursByDate: Map<string, number>,
  weekStartsOn: WeekStart = 'monday',
): {
  label: string;
  shortLabel: string;
  date: Date;
  hours: number;
}[] {
  const start = startOfWeek(reference, weekStartsOn);
  const labels = getDayLabels(weekStartsOn);
  // Single-letter abbreviations matched to labels order
  const shorts = labels.map((l) => l[0]);
  return labels.map((label, idx) => {
    const date = new Date(start);
    date.setDate(start.getDate() + idx);
    return {
      label,
      shortLabel: shorts[idx],
      date,
      hours: hoursByDate.get(ymd(date)) ?? 0,
    };
  });
}

function formatHours(hours: number): string {
  // Respect the workspace `time_display` preference (decimal vs HH:MM).
  const mode = useAccountSettingsStore.getState().settings?.time_display ?? 'hh_mm';
  if (!hours) return mode === 'decimal' ? '0.00' : '0:00';
  if (mode === 'decimal') return hours.toFixed(2);
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function formatDate(date: Date): { primary: string; secondary: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cmp = new Date(date);
  cmp.setHours(0, 0, 0, 0);
  const isToday = today.getTime() === cmp.getTime();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return { primary: isToday ? 'Today' : weekday, secondary: dateStr };
}

function num(s: string | number): number {
  if (typeof s === 'number') return s;
  return Number.parseFloat(s) || 0;
}

function formatTimerElapsed(entry: TimeEntry, nowMs: number): string {
  const startedMs = entry.started_at ? new Date(entry.started_at).getTime() : nowMs;
  const accumulatedSec = num(entry.hours) * 3600;
  const elapsedSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000)) + accumulatedSec;
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = Math.floor(elapsedSec % 60);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type ApprovalStatusFilter = 'submitted' | 'approved' | 'rejected' | 'all';
type ApprovalRangeFilter = 'day' | 'week' | 'semimonth' | 'month' | 'quarter' | 'custom' | 'all';
type ApprovalGroupBy = 'person' | 'project' | 'client';
type ApprovalRoleFilter = Role | 'all';

function ApprovalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | string;
  options: Array<{ value: number | string; label: string }>;
  onChange: (v: number | string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const isActive = value !== 'all';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-base shadow-sm transition ${
          isActive
            ? 'border-primary text-primary'
            : 'border-slate-200 text-text hover:bg-slate-50'
        }`}
      >
        {label ? <span className="text-text/70">{label}:</span> : null}
        <span className={`font-bold ${isActive ? 'text-primary' : 'text-text'}`}>
          {current?.label ?? 'All'}
        </span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 z-40 mt-1 max-h-80 w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white text-base shadow-xl">
            {options.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`block w-full px-4 py-2.5 text-left transition hover:bg-bg ${
                  opt.value === value
                    ? 'bg-primary-soft/40 font-bold text-primary'
                    : 'font-medium text-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ApprovalPanel({
  submissions,
  loading,
  error,
  decidingId,
  rejectingId,
  rejectNote,
  currentUserId,
  currentUserRole,
  statusFilter,
  rangeFilter,
  teammateFilter,
  groupBy,
  roleFilter,
  clientFilter,
  projectFilter,
  rangeLabel,
  teammates,
  projects,
  onChangeStatus,
  onChangeRange,
  onChangeTeammate,
  onChangeGroupBy,
  onChangeRoleFilter,
  onChangeClient,
  onChangeProject,
  onShiftAnchor,
  anchorDate,
  onPickAnchor,
  calendarOpen,
  onToggleCalendar,
  onCloseCalendar,
  onWithdrawApproval,
  onApprove,
  onOpenReject,
  onCancelReject,
  onChangeRejectNote,
  onSubmitReject,
  onOpenInTimesheet,
  onRefresh,
}: {
  submissions: Submission[];
  loading: boolean;
  error: string | null;
  decidingId: number | null;
  rejectingId: number | null;
  rejectNote: string;
  currentUserId: number | undefined;
  currentUserRole: Role;
  statusFilter: ApprovalStatusFilter;
  rangeFilter: ApprovalRangeFilter;
  teammateFilter: number | 'all';
  groupBy: ApprovalGroupBy;
  roleFilter: ApprovalRoleFilter;
  clientFilter: number | 'all';
  projectFilter: number | 'all';
  rangeLabel: string;
  teammates: User[];
  projects: ProjectListItem[];
  onChangeStatus: (v: ApprovalStatusFilter) => void;
  onChangeRange: (v: ApprovalRangeFilter) => void;
  onChangeTeammate: (v: number | 'all') => void;
  onChangeGroupBy: (v: ApprovalGroupBy) => void;
  onChangeRoleFilter: (v: ApprovalRoleFilter) => void;
  onChangeClient: (v: number | 'all') => void;
  onChangeProject: (v: number | 'all') => void;
  onShiftAnchor: (delta: number) => void;
  anchorDate: Date;
  onPickAnchor: (d: Date) => void;
  calendarOpen: boolean;
  onToggleCalendar: () => void;
  onCloseCalendar: () => void;
  onWithdrawApproval: () => void;
  onApprove: (s: Submission) => void;
  onOpenReject: (s: Submission) => void;
  onCancelReject: () => void;
  onChangeRejectNote: (v: string) => void;
  onSubmitReject: (s: Submission) => void;
  onOpenInTimesheet: (s: Submission) => void;
  onRefresh: () => void;
}) {
  // Apply client-side filters that the backend doesn't support yet (Role).
  // Client/Project filters are UI-only placeholders — backend support pending.
  const userRoleById = new Map(teammates.map((u) => [u.id, u.role]));
  const filteredSubmissions = submissions.filter((s) => {
    if (roleFilter !== 'all') {
      const r = userRoleById.get(s.user_id);
      if (r !== roleFilter) return false;
    }
    return true;
  });

  // Distinct clients derived from the loaded project list.
  const clientOptions = (() => {
    const seen = new Map<string, { value: number | 'all'; label: string }>();
    for (const p of projects) {
      if (p.client_id != null && !seen.has(String(p.client_id))) {
        seen.set(String(p.client_id), { value: p.client_id, label: p.client_name });
      }
    }
    return [{ value: 'all' as const, label: 'All clients' }, ...Array.from(seen.values())];
  })();

  // Project list, filtered by the active client filter when one is set.
  const projectOptions = [
    { value: 'all' as const, label: 'All projects' },
    ...projects
      .filter((p) => clientFilter === 'all' || p.client_id === clientFilter)
      .map((p) => ({ value: p.id, label: p.name })),
  ];

  // Totals across the filtered submissions — Harvest-style summary card.
  const totals = filteredSubmissions.reduce(
    (acc, s) => {
      const total = Number.parseFloat(s.total_hours) || 0;
      const billable = Number.parseFloat(s.billable_hours) || 0;
      acc.total += total;
      acc.billable += billable;
      acc.nonBillable += Math.max(total - billable, 0);
      return acc;
    },
    { total: 0, billable: 0, nonBillable: 0 },
  );
  const pct = (part: number) =>
    totals.total > 0 ? Math.round((part / totals.total) * 100) : 0;

  // Group submissions per the Group by selector.
  const groupedSubmissions = (() => {
    if (groupBy === 'person') {
      const groups = new Map<string, { label: string; rows: Submission[] }>();
      for (const s of filteredSubmissions) {
        const key = String(s.user_id);
        const label = s.user_name || s.user_email || 'Unknown';
        if (!groups.has(key)) groups.set(key, { label, rows: [] });
        groups.get(key)!.rows.push(s);
      }
      return Array.from(groups.values());
    }
    // Project / Client grouping is a UI placeholder — submissions don't carry
    // entry-level project/client data, so we show all rows ungrouped under a
    // single header for now.
    return [
      {
        label: groupBy === 'project' ? 'All projects' : 'All clients',
        rows: filteredSubmissions,
      },
    ];
  })();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="rounded-t-2xl border-b border-slate-200 bg-gradient-to-br from-primary-soft/40 via-white to-bg px-4 py-5 sm:px-6 sm:py-6">
        <h2 className="font-heading text-2xl font-bold text-text sm:text-3xl">Approval</h2>

        {/* Top control row — Range + date navigator on left, Status + Group by on right */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ApprovalSelect
            label="Range"
            value={rangeFilter}
            onChange={(v) => onChangeRange(v as ApprovalRangeFilter)}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'semimonth', label: 'Semimonth' },
              { value: 'month', label: 'Month' },
              { value: 'quarter', label: 'Quarter' },
              { value: 'custom', label: 'Custom' },
              { value: 'all', label: 'All time' },
            ]}
          />
          {rangeFilter !== 'all' ? (
            <div className="relative inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => onShiftAnchor(-1)}
                disabled={rangeFilter === 'custom'}
                className="inline-flex h-10 w-10 items-center justify-center rounded-l-lg text-text/70 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous range"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onToggleCalendar}
                className="inline-flex items-center gap-2 px-4 py-2 text-base font-bold text-text transition hover:bg-slate-50"
              >
                <Calendar className="h-4 w-4 text-text/70" />
                {rangeLabel}
              </button>
              <button
                type="button"
                onClick={() => onShiftAnchor(1)}
                disabled={rangeFilter === 'custom'}
                className="inline-flex h-10 w-10 items-center justify-center rounded-r-lg text-text/70 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next range"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {calendarOpen ? (
                <div className="absolute left-0 top-full z-40 mt-2">
                  <CalendarPopover
                    value={anchorDate}
                    onSelect={(d) => {
                      onPickAnchor(d);
                      onCloseCalendar();
                    }}
                    onClose={onCloseCalendar}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <ApprovalSelect
              label="Status"
              value={statusFilter}
              onChange={(v) => onChangeStatus(v as ApprovalStatusFilter)}
              options={[
                { value: 'submitted', label: 'Pending approval' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'all', label: 'All' },
              ]}
            />
            <ApprovalSelect
              label="Group by"
              value={groupBy}
              onChange={(v) => onChangeGroupBy(v as ApprovalGroupBy)}
              options={[
                { value: 'person', label: 'Person' },
                { value: 'project', label: 'Project' },
                { value: 'client', label: 'Client' },
              ]}
            />
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <ApprovalSelect
              label="Client"
              value={clientFilter}
              onChange={(v) => onChangeClient(v === 'all' ? 'all' : Number(v))}
              options={clientOptions}
            />
            <ApprovalSelect
              label="Project"
              value={projectFilter}
              onChange={(v) => onChangeProject(v === 'all' ? 'all' : Number(v))}
              options={projectOptions}
            />
            <ApprovalSelect
              label="Role"
              value={roleFilter}
              onChange={(v) => onChangeRoleFilter(v as ApprovalRoleFilter)}
              options={[
                { value: 'all', label: 'All roles' },
                { value: 'owner', label: 'Owner' },
                { value: 'admin', label: 'Admin' },
                { value: 'manager', label: 'Manager' },
                { value: 'member', label: 'Member' },
              ]}
            />
            {teammates.length > 0 ? (
              <ApprovalSelect
                label="Teammate"
                value={teammateFilter}
                onChange={(v) => onChangeTeammate(v === 'all' ? 'all' : Number(v))}
                options={[
                  { value: 'all', label: 'All teammates' },
                  ...teammates.map((u) => ({ value: u.id, label: u.full_name || u.email })),
                ]}
              />
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary-soft px-5 py-2.5 text-base font-bold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary-soft/70 sm:ml-auto sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Total time summary card — Harvest layout */}
        <div className="mt-5 rounded-xl border-2 border-primary/15 bg-white px-4 py-4 shadow-md sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-4 sm:gap-6">
            <div>
              <p className="text-base font-bold uppercase tracking-wider text-text/70">
                Total time
              </p>
              <p className="mt-1 font-heading text-4xl font-bold text-text">
                {totals.total.toFixed(2)}
                <span className="ml-2 text-xl font-bold text-text/60">hr</span>
              </p>
            </div>
            <div className="flex flex-col gap-2.5 text-base">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-4 w-4 flex-shrink-0 rounded-sm bg-primary" />
                <span className="font-semibold text-text">Billable</span>
                <span className="ml-auto font-mono text-lg font-bold tabular-nums text-text">
                  {totals.billable.toFixed(2)}
                </span>
                <span className="text-base font-semibold text-text/70">({pct(totals.billable)}%)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-4 w-4 flex-shrink-0 rounded-sm bg-primary-soft ring-1 ring-primary/30" />
                <span className="font-semibold text-text">Non-billable</span>
                <span className="ml-auto font-mono text-lg font-bold tabular-nums text-text">
                  {totals.nonBillable.toFixed(2)}
                </span>
                <span className="text-base font-semibold text-text/70">({pct(totals.nonBillable)}%)</span>
              </div>
            </div>
            <span className="rounded-full bg-primary-soft px-4 py-1.5 text-sm font-bold text-primary ring-1 ring-primary/20">
              {filteredSubmissions.length}{' '}
              {filteredSubmissions.length === 1 ? 'submission' : 'submissions'}
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <div className="border-b border-danger/20 bg-danger/10 px-5 py-3 text-base font-medium text-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="px-5 py-12 text-center text-base text-text/70">Loading submissions…</div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="m-6 flex flex-col items-center rounded-2xl bg-slate-100/70 px-6 py-20 text-center">
          <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm">
            <FileSearch className="h-10 w-10 text-text/50" />
          </span>
          <p className="mt-6 max-w-lg text-lg font-medium text-text/70">
            {statusFilter === 'submitted'
              ? 'No submissions to approve right now. New submissions will appear here.'
              : 'No approval data found matching your current filters. Try adjusting your filters or time range.'}
          </p>
        </div>
      ) : (
        <div>
          {groupedSubmissions.map((group, gIdx) => (
            <div key={`${groupBy}-${gIdx}-${group.label}`}>
              {groupBy !== 'person' || groupedSubmissions.length > 1 ? (
                <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-2.5">
                  <p className="text-sm font-bold uppercase tracking-wider text-text/70">
                    {group.label}
                    <span className="ml-2 text-xs font-medium normal-case text-text/60">
                      · {group.rows.length}{' '}
                      {group.rows.length === 1 ? 'submission' : 'submissions'}
                    </span>
                  </p>
                </div>
              ) : null}
              <ul className="divide-y divide-slate-100">
                {group.rows.map((submission) => {
                  const isDeciding = decidingId === submission.id;
                  const isRejecting = rejectingId === submission.id;
                  const range =
                    submission.start_date === submission.end_date
                      ? new Date(`${submission.start_date}T00:00:00`).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : `${new Date(`${submission.start_date}T00:00:00`).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })} – ${new Date(`${submission.end_date}T00:00:00`).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}`;
                  const submittedAt = new Date(submission.submitted_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                  const submitterRole = userRoleById.get(submission.user_id);

                  return (
                    <li key={submission.id} className="px-6 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-heading text-base font-bold text-text">
                              {submission.user_name || submission.user_email}
                            </p>
                            {submission.user_id === currentUserId ? (
                              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                                You
                              </span>
                            ) : null}
                            {submitterRole ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-text/70">
                                {submitterRole}
                              </span>
                            ) : null}
                            <span className="text-sm text-text/60">·</span>
                            <p className="text-sm font-medium text-text/70">{range}</p>
                          </div>
                          <p className="mt-1 text-sm font-medium text-text/70">
                            Submitted {submittedAt}
                          </p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm">
                            <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary">
                              {Number.parseFloat(submission.total_hours).toFixed(2)} hr total
                            </span>
                            <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent-dark">
                              {Number.parseFloat(submission.billable_hours).toFixed(2)} hr billable
                            </span>
                            <span className="text-sm font-medium text-text/70">
                              {submission.entry_count}{' '}
                              {submission.entry_count === 1 ? 'entry' : 'entries'}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenInTimesheet(submission)}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-text shadow-sm transition hover:bg-slate-50"
                          >
                            Review entries
                          </button>
                          {submission.status === 'submitted' && !isRejecting ? (
                            (() => {
                              const blockedSelf =
                                submission.user_id === currentUserId &&
                                currentUserRole === 'manager';
                              const blockMsg = blockedSelf
                                ? 'Managers cannot decide on their own timesheet — ask another approver to review.'
                                : undefined;
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onOpenReject(submission)}
                                    disabled={isDeciding || blockedSelf}
                                    title={blockMsg}
                                    className="rounded-lg border border-danger/40 bg-white px-4 py-2 text-sm font-bold text-danger shadow-sm transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onApprove(submission)}
                                    disabled={isDeciding || blockedSelf}
                                    title={blockMsg}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-text shadow-sm transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {isDeciding ? 'Approving…' : 'Approve'}
                                  </button>
                                </>
                              );
                            })()
                          ) : submission.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-bold text-accent-dark">
                              Approved
                              {submission.decided_by_name ? ` · ${submission.decided_by_name}` : ''}
                            </span>
                          ) : submission.status === 'rejected' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5 text-sm font-bold text-danger">
                              Rejected
                              {submission.decided_by_name ? ` · ${submission.decided_by_name}` : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {submission.status !== 'submitted' && submission.decision_note ? (
                        <p
                          className={`mt-2.5 rounded-md px-3 py-1.5 text-sm italic ${
                            submission.status === 'rejected'
                              ? 'bg-danger/5 text-danger'
                              : 'bg-accent-soft/50 text-accent-dark'
                          }`}
                        >
                          "{submission.decision_note}"
                        </p>
                      ) : null}

                      {isRejecting ? (
                        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
                          <label className="block">
                            <span className="text-sm font-bold uppercase tracking-wider text-danger">
                              Reason for rejection
                            </span>
                            <textarea
                              rows={2}
                              autoFocus
                              value={rejectNote}
                              onChange={(e) => onChangeRejectNote(e.target.value)}
                              placeholder="What should they fix before resubmitting?"
                              className="mt-2 w-full resize-none rounded-md border border-danger/30 bg-white px-3 py-2 text-base text-text transition focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/20"
                            />
                          </label>
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={onCancelReject}
                              disabled={isDeciding}
                              className="rounded-lg px-4 py-2 text-sm font-semibold text-text/70 transition hover:bg-slate-100 hover:text-text disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => onSubmitReject(submission)}
                              disabled={isDeciding}
                              className="rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-danger/90 disabled:opacity-50"
                            >
                              {isDeciding ? 'Sending…' : 'Send rejection'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Withdraw approval — Harvest-style footer action. Only shown when at
          least one approved submission is currently visible. */}
      {filteredSubmissions.some((s) => s.status === 'approved') ? (
        <div className="border-t border-slate-200 bg-slate-50/40 px-6 py-4">
          <button
            type="button"
            onClick={onWithdrawApproval}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-base font-bold text-text shadow-sm transition hover:bg-accent-dark"
          >
            <Send className="h-4 w-4" />
            Withdraw approval
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SubmissionStatusBanner({
  submission,
  canWithdraw,
  busy,
  onWithdraw,
}: {
  submission: Submission;
  canWithdraw: boolean;
  busy: boolean;
  onWithdraw: () => void;
}) {
  const tone =
    submission.status === 'approved'
      ? { border: 'border-accent', bg: 'bg-accent-soft', accent: 'text-accent-dark', icon: 'bg-accent-dark' }
      : submission.status === 'rejected'
        ? { border: 'border-danger', bg: 'bg-danger/10', accent: 'text-danger', icon: 'bg-danger' }
        : { border: 'border-primary', bg: 'bg-primary-soft', accent: 'text-primary', icon: 'bg-primary' };

  const label =
    submission.status === 'approved'
      ? 'Approved'
      : submission.status === 'rejected'
        ? 'Rejected'
        : 'Awaiting approval';

  const sub =
    submission.status === 'approved'
      ? `Approved${submission.decided_by_name ? ` by ${submission.decided_by_name}` : ''}${
          submission.decided_at
            ? ` on ${new Date(submission.decided_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}`
            : ''
        }. Entries are locked.`
      : submission.status === 'rejected'
        ? `Returned for revision${submission.decided_by_name ? ` by ${submission.decided_by_name}` : ''}. Edit and resubmit.`
        : `Submitted ${new Date(submission.submitted_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}. You can't edit entries until a decision is made.`;

  return (
    <div
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 border-l-4 ${tone.border} ${tone.bg} px-5 py-4 shadow-md`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full ${tone.icon}`} />
        <div className="min-w-0">
          <p className={`font-heading text-lg font-bold ${tone.accent}`}>{label}</p>
          <p className="mt-1 text-base font-medium text-text/80">{sub}</p>
          {submission.decision_note ? (
            <p className="mt-2 rounded-md bg-white/80 px-3 py-1.5 text-sm italic text-text/80">
              "{submission.decision_note}"
            </p>
          ) : null}
        </div>
      </div>
      {canWithdraw ? (
        <button
          type="button"
          onClick={onWithdraw}
          disabled={busy}
          className={`rounded-lg border-2 ${tone.border} bg-white px-4 py-2 text-sm font-bold ${tone.accent} transition hover:bg-bg disabled:opacity-50`}
        >
          {busy ? 'Withdrawing…' : 'Withdraw'}
        </button>
      ) : null}
    </div>
  );
}

function EntryRow({
  entry,
  editingId,
  tickNow,
  timerBusy,
  locked,
  hasRunningTimer,
  onEdit,
  onDelete,
  onStop,
  onStartFromRow,
}: {
  entry: TimeEntry;
  editingId: number | null;
  tickNow: number;
  timerBusy: boolean;
  locked: boolean;
  hasRunningTimer: boolean;
  onEdit: (e: TimeEntry) => void;
  onDelete: (e: TimeEntry) => void;
  onStop: () => void;
  onStartFromRow: (e: TimeEntry) => void;
}) {
  return (
    <li
      className={`grid grid-cols-[1fr_56px_auto] items-start gap-2 px-3 py-4 transition sm:grid-cols-[1fr_100px_auto] sm:gap-4 sm:px-5 ${
        locked
          ? 'bg-slate-100'
          : entry.is_running
            ? 'bg-accent-soft/40 hover:bg-accent-soft/40'
            : editingId === entry.id
              ? 'bg-primary-soft/30 hover:bg-primary-soft/30'
              : 'hover:bg-slate-50/40'
      }`}
    >
      <div className="min-w-0">
        <p className="font-heading text-base font-bold text-text">{entry.project_name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-text/70">{entry.client_name}</p>
          {entry.is_running ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-text">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-text" />
              Running
            </span>
          ) : entry.is_billable ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-dark">
              Billable
            </span>
          ) : (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-text/70">
              Non-billable
            </span>
          )}
          {entry.jira_issue_key ? (
            <span
              className="rounded-full bg-primary-soft px-2 py-0.5 font-mono text-xs font-semibold text-primary"
              title={`Jira issue ${entry.jira_issue_key}`}
            >
              {entry.jira_issue_key}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm font-medium text-text/70">{entry.task_name}</p>
        {entry.notes ? <p className="mt-1 text-sm text-text">{entry.notes}</p> : null}
      </div>
      <p className="text-right font-mono text-base font-bold tabular-nums text-text">
        {entry.is_running
          ? formatTimerElapsed(entry, tickNow)
          : formatHoursDecimal(num(entry.hours))}
      </p>
      <div className="flex items-center gap-0.5 sm:gap-1">
        {locked ? (
          <span
            title="This entry has been approved and locked."
            aria-label="Approved and locked"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-muted"
          >
            <Lock className="h-3.5 w-3.5" />
          </span>
        ) : entry.is_running ? (
          <button
            type="button"
            onClick={onStop}
            disabled={timerBusy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-danger text-xs font-semibold text-white transition hover:bg-danger/90 disabled:opacity-50 sm:w-auto sm:gap-1.5 sm:px-2.5"
            aria-label="Stop timer"
          >
            <Pause className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Stop</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onStartFromRow(entry)}
              disabled={timerBusy}
              title={hasRunningTimer ? 'Stop the running timer and start this one' : 'Start timer for this entry'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-xs font-bold text-text shadow-sm transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:gap-1.5 sm:px-3"
              aria-label="Start timer"
            >
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Start</span>
            </button>
            <button
              type="button"
              onClick={() => onEdit(entry)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-slate-100 hover:text-text sm:h-8 sm:w-8"
              aria-label="Edit entry"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(entry)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger sm:h-8 sm:w-8"
              aria-label="Delete entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function formatHoursDecimal(hours: number): string {
  if (!hours) return '0:00';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function CalendarPopover({
  value,
  onSelect,
  onClose,
}: {
  value: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const [viewedMonth, setViewedMonth] = useState<Date>(() => {
    const d = new Date(value);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthLabel = viewedMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Build a 6-row grid (Sun..Sat) covering the month.
  const firstDayOfMonth = new Date(viewedMonth);
  const startOffset = firstDayOfMonth.getDay(); // 0 = Sun
  const gridStart = new Date(firstDayOfMonth);
  gridStart.setDate(firstDayOfMonth.getDate() - startOffset);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }

  const shiftMonth = (delta: number) => {
    setViewedMonth((cur) => {
      const next = new Date(cur);
      next.setMonth(cur.getMonth() + delta);
      return next;
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <div className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-lg sm:left-0 sm:right-auto">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-slate-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="font-heading text-sm font-bold text-text">{monthLabel}</p>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-slate-100"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <p
              key={i}
              className="py-1 text-[10px] font-semibold uppercase tracking-wider text-muted"
            >
              {d}
            </p>
          ))}
          {cells.map((d) => {
            const inMonth = d.getMonth() === viewedMonth.getMonth();
            const isSelected = sameDay(d, value);
            const isToday = sameDay(d, today);
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => onSelect(d)}
                className={`h-8 rounded-md text-xs font-medium transition ${
                  isSelected
                    ? 'bg-primary text-white'
                    : isToday
                      ? 'bg-primary-soft text-primary ring-1 ring-primary/30'
                      : inMonth
                        ? 'text-text hover:bg-slate-100'
                        : 'text-muted/50 hover:bg-slate-50'
                }`}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
          <button
            type="button"
            onClick={() => onSelect(today)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Today
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted hover:text-text"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'member';
  const canSeeTeammates = role === 'admin' || role === 'owner' || role === 'manager';
  const { confirmDialog, ask } = useConfirm();
  const weekStartsOn = useWeekStart();
  const timerMode = useTimerMode();

  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [activeTab, setActiveTab] = useState<Tab>('timesheet');
  const [view, setView] = useState<View>('day');
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Quick-add form state
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectTasks, setProjectTasks] = useState<ProjectTaskEntry[]>([]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [projectTaskId, setProjectTaskId] = useState<number | ''>('');
  const [hoursInput, setHoursInput] = useState('');
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [jiraKeyInput, setJiraKeyInput] = useState('');
  const [billable, setBillable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);

  // Editing state — when set, the form is in "edit" mode for this entry id
  const [editingId, setEditingId] = useState<number | null>(null);

  // Running timer state
  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(null);
  const [tickNow, setTickNow] = useState<number>(() => Date.now());
  const [timerBusy, setTimerBusy] = useState(false);

  // Teammates picker (US-12) — null = self
  const [teammates, setTeammates] = useState<User[]>([]);
  const [viewingUserId, setViewingUserId] = useState<number | null>(null);
  const [teammatesMenuOpen, setTeammatesMenuOpen] = useState(false);

  // Calendar popover
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Outlook integration (Epic 8)
  const [outlookStatus, setOutlookStatus] = useState<OutlookStatus | null>(null);
  const [outlookPickerOpen, setOutlookPickerOpen] = useState(false);
  const [pendingOutlookEvent, setPendingOutlookEvent] = useState<OutlookEvent | null>(null);
  const [outlookConnecting, setOutlookConnecting] = useState(false);
  const [outlookFlash, setOutlookFlash] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  // Week-grid view state
  const [editedCells, setEditedCells] = useState<Map<string, string>>(new Map());
  const [addedRows, setAddedRows] = useState<
    Array<{ project_id: number; project_task_id: number; project_name: string; client_name: string; task_name: string; is_billable: boolean }>
  >([]);
  const [gridSaving, setGridSaving] = useState(false);
  const [gridAddOpen, setGridAddOpen] = useState(false);
  const [gridAddProjectId, setGridAddProjectId] = useState<number | ''>('');
  const [gridAddTaskId, setGridAddTaskId] = useState<number | ''>('');
  const [gridAddTasks, setGridAddTasks] = useState<ProjectTaskEntry[]>([]);

  // Submissions (Epic 6) — covers the active week for whoever is being viewed
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Approval queue (manager view)
  const [pendingSubmissions, setPendingSubmissions] = useState<Submission[]>([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<
    'submitted' | 'approved' | 'rejected' | 'all'
  >('submitted');
  const [approvalRange, setApprovalRange] = useState<ApprovalRangeFilter>('all');
  const [approvalTeammate, setApprovalTeammate] = useState<number | 'all'>('all');
  const [approvalGroupBy, setApprovalGroupBy] = useState<ApprovalGroupBy>('person');
  const [approvalRoleFilter, setApprovalRoleFilter] = useState<ApprovalRoleFilter>('all');
  const [approvalClientId, setApprovalClientId] = useState<number | 'all'>('all');
  const [approvalProjectId, setApprovalProjectId] = useState<number | 'all'>('all');
  // The approval page has its own week navigator (independent of the
  // Timesheet's currentDate). Defaults to today's week.
  const [approvalAnchor, setApprovalAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [approvalCalendarOpen, setApprovalCalendarOpen] = useState(false);

  // Entries for the active week
  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);

  // Load active projects once
  useEffect(() => {
    listProjects({ is_active: true })
      .then((res) => setProjects(res.results))
      .catch(() => setProjects([]));
  }, []);

  // Load running timer (if any) on mount so refresh keeps the timer alive.
  useEffect(() => {
    getRunningEntry()
      .then((entry) => setRunningEntry(entry))
      .catch(() => setRunningEntry(null));
  }, []);

  // Outlook integration — load connection status, surface OAuth callback flash.
  useEffect(() => {
    getOutlookStatus()
      .then(setOutlookStatus)
      .catch(() => setOutlookStatus(null));
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('outlook');
    if (flag === 'connected') {
      setOutlookFlash({ kind: 'ok', msg: 'Outlook connected. You can now pull in calendar events.' });
      params.delete('outlook');
      const qs = params.toString();
      const newUrl = window.location.pathname + (qs ? `?${qs}` : '');
      window.history.replaceState({}, '', newUrl);
      getOutlookStatus().then(setOutlookStatus).catch(() => undefined);
    } else if (flag === 'error') {
      setOutlookFlash({
        kind: 'error',
        msg: `Outlook connection failed (${params.get('reason') || 'unknown'}).`,
      });
      params.delete('outlook');
      params.delete('reason');
      params.delete('detail');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  // Load teammates if the user can switch views.
  useEffect(() => {
    if (!canSeeTeammates) return;
    listUsers()
      .then((rows) => setTeammates(rows.filter((u) => u.id !== user?.id)))
      .catch(() => setTeammates([]));
  }, [canSeeTeammates, user?.id]);

  // Tick every second while a timer is running so the elapsed display stays live.
  useEffect(() => {
    if (!runningEntry) return;
    const id = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningEntry]);

  // When project changes, load its tasks and reset task selection.
  useEffect(() => {
    if (projectId === '') {
      setProjectTasks([]);
      setProjectTaskId('');
      return;
    }
    listProjectTasks(projectId as number)
      .then((rows) => {
        setProjectTasks(rows);
        // Default-select first task if none chosen yet
        setProjectTaskId((cur) => (cur === '' && rows.length > 0 ? rows[0].id : cur));
      })
      .catch(() => setProjectTasks([]));
  }, [projectId]);

  // Default billable from selected project_task
  useEffect(() => {
    if (projectTaskId === '') return;
    const pt = projectTasks.find((p) => p.id === projectTaskId);
    if (pt && editingId === null) setBillable(pt.is_billable);
  }, [projectTaskId, projectTasks, editingId]);

  // Load entries for the active week
  const weekStart = useMemo(() => startOfWeek(currentDate, weekStartsOn), [currentDate, weekStartsOn]);
  const weekEndStr = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    return ymd(end);
  }, [weekStart]);
  const weekStartStr = useMemo(() => ymd(weekStart), [weekStart]);

  const effectiveUserId = viewingUserId ?? user?.id ?? 0;

  const refetchEntries = () => {
    setEntriesLoading(true);
    listTimeEntries({
      start_date: weekStartStr,
      end_date: weekEndStr,
      user_id: viewingUserId ?? undefined,
    })
      .then((rows) => setWeekEntries(rows))
      .catch(() => setWeekEntries([]))
      .finally(() => setEntriesLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setEntriesLoading(true);
    listTimeEntries({
      start_date: weekStartStr,
      end_date: weekEndStr,
      user_id: viewingUserId ?? undefined,
    })
      .then((rows) => {
        if (!cancelled) setWeekEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setWeekEntries([]);
      })
      .finally(() => {
        if (!cancelled) setEntriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStartStr, weekEndStr, viewingUserId]);

  // Fetch the active submission (if any) for whoever is being viewed for this week.
  const refetchActiveSubmission = () => {
    listSubmissions({
      user_id: viewingUserId ?? user?.id,
      start_date: weekStartStr,
      end_date: weekEndStr,
    })
      .then((rows) => {
        // Prefer non-rejected (active lock); else most recent.
        const active = rows.find(
          (s) => s.status === 'submitted' || s.status === 'approved',
        );
        setActiveSubmission(active ?? rows[0] ?? null);
      })
      .catch(() => setActiveSubmission(null));
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    listSubmissions({
      user_id: viewingUserId ?? user.id,
      start_date: weekStartStr,
      end_date: weekEndStr,
    })
      .then((rows) => {
        if (cancelled) return;
        const active = rows.find(
          (s) => s.status === 'submitted' || s.status === 'approved',
        );
        setActiveSubmission(active ?? rows[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setActiveSubmission(null);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStartStr, weekEndStr, viewingUserId, user?.id]);

  const activeDateStr = ymd(currentDate);
  const dayEntries = useMemo(
    () => weekEntries.filter((e) => e.date === activeDateStr && e.user_id === effectiveUserId),
    [weekEntries, activeDateStr, effectiveUserId],
  );

  const hoursByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of weekEntries) {
      if (e.user_id !== effectiveUserId) continue;
      map.set(e.date, (map.get(e.date) ?? 0) + num(e.hours));
    }
    return map;
  }, [weekEntries, effectiveUserId]);

  const weekDays = useMemo(
    () => buildWeekDays(currentDate, hoursByDate, weekStartsOn),
    [currentDate, hoursByDate, weekStartsOn],
  );

  const dayTotal = dayEntries.reduce((sum, e) => sum + num(e.hours), 0);
  const dayBillable = dayEntries
    .filter((e) => e.is_billable)
    .reduce((sum, e) => sum + num(e.hours), 0);
  const weekTotal = weekDays.reduce((s, d) => s + d.hours, 0);
  const weekBillable = weekEntries
    .filter((e) => e.user_id === effectiveUserId && e.is_billable)
    .reduce((sum, e) => sum + num(e.hours), 0);

  const { primary, secondary } = formatDate(currentDate);

  const shift = (delta: number) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta);
      return next;
    });
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCurrentDate(d);
  };

  const resetForm = () => {
    setProjectId('');
    setProjectTaskId('');
    setHoursInput('');
    setStartTimeInput('');
    setEndTimeInput('');
    setNotesInput('');
    setJiraKeyInput('');
    setBillable(true);
    setFormError(null);
    setEditingId(null);
  };

  // Convert "HH:MM" string to minutes since midnight. Returns null if invalid.
  const parseTimeToMinutes = (s: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const h = Number.parseInt(m[1], 10);
    const mm = Number.parseInt(m[2], 10);
    if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return h * 60 + mm;
  };

  // Compute decimal hours from start/end "HH:MM" times. Returns "" on invalid input.
  const hoursFromStartEnd = (start: string, end: string): string => {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (s == null || e == null || e <= s) return '';
    const diffHours = (e - s) / 60;
    return diffHours.toFixed(2);
  };

  const handleSave = async () => {
    setFormError(null);
    if (projectId === '') {
      setFormError('Pick a project.');
      return;
    }
    if (projectTaskId === '') {
      setFormError('Pick a task.');
      return;
    }

    // In start_end mode, derive hours from start/end times. If both inputs are
    // present, they take precedence over hoursInput. If only one is filled,
    // fall back to hoursInput (e.g. when editing without retyping times).
    let hoursToSave = hoursInput.trim();
    if (timerMode === 'start_end' && startTimeInput.trim() && endTimeInput.trim()) {
      const derived = hoursFromStartEnd(startTimeInput, endTimeInput);
      if (!derived) {
        setFormError('End time must be after start time (use HH:MM, 24-hour).');
        return;
      }
      hoursToSave = derived;
    }
    if (!hoursToSave) {
      setFormError(
        timerMode === 'start_end'
          ? 'Enter start and end times.'
          : 'Enter hours.',
      );
      return;
    }
    setSaving(true);
    try {
      if (editingId !== null) {
        await updateTimeEntry(editingId, {
          project_id: projectId as number,
          project_task_id: projectTaskId as number,
          date: activeDateStr,
          hours: hoursToSave,
          notes: notesInput.trim(),
          is_billable: billable,
          jira_issue_key: jiraKeyInput.trim(),
        });
      } else {
        const created = await createTimeEntry({
          project_id: projectId as number,
          project_task_id: projectTaskId as number,
          date: activeDateStr,
          hours: hoursToSave,
          notes: notesInput.trim(),
          is_billable: billable,
          jira_issue_key: jiraKeyInput.trim(),
        });
        if (pendingOutlookEvent) {
          try {
            await markOutlookEventImported({
              outlook_event_id: pendingOutlookEvent.outlook_event_id,
              time_entry_id: created.id,
              subject: pendingOutlookEvent.subject,
              event_start: pendingOutlookEvent.start,
              event_end: pendingOutlookEvent.end,
            });
          } catch {
            // Non-fatal: the entry is saved; the picker will just show the event again next time.
          }
        }
      }
      resetForm();
      refetchEntries();
      setPendingOutlookEvent(null);
      setQuickAddOpen(false);
    } catch (err) {
      setFormError(extractApiError(err, 'Could not save entry.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (entry: TimeEntry) => {
    setEditingId(entry.id);
    setProjectId(entry.project_id);
    setProjectTaskId(entry.project_task_id);
    setHoursInput(num(entry.hours).toFixed(2));
    setNotesInput(entry.notes);
    setJiraKeyInput(entry.jira_issue_key ?? '');
    setBillable(entry.is_billable);
    setFormError(null);
    setQuickAddOpen(true);
  };

  const openQuickAdd = () => {
    setEditingId(null);
    setProjectId('');
    setProjectTaskId('');
    setHoursInput('');
    setNotesInput('');
    setJiraKeyInput('');
    setBillable(true);
    setFormError(null);
    setPendingOutlookEvent(null);
    setQuickAddOpen(true);
  };

  const handleConnectOutlook = async () => {
    setOutlookConnecting(true);
    setOutlookFlash(null);
    try {
      const { authorize_url } = await startOutlookOAuth();
      window.location.href = authorize_url;
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        'Could not start the Outlook connection.';
      setOutlookFlash({ kind: 'error', msg: detail });
      setOutlookConnecting(false);
    }
  };

  const handleDisconnectOutlook = async () => {
    if (!window.confirm('Disconnect KlokView from your Outlook calendar?')) return;
    try {
      await disconnectOutlook();
      setOutlookStatus({ connected: false, email: null, connected_at: null, configured: outlookStatus?.configured ?? true });
      setOutlookFlash({ kind: 'ok', msg: 'Outlook disconnected.' });
    } catch {
      setOutlookFlash({ kind: 'error', msg: 'Could not disconnect Outlook.' });
    }
  };

  const openQuickAddFromOutlook = (event: OutlookEvent) => {
    setEditingId(null);
    setProjectId('');
    setProjectTaskId('');
    // Convert decimal hours to "H:MM" so the time entry input matches the rest of the UI.
    const h = Math.floor(event.duration_hours);
    const m = Math.round((event.duration_hours - h) * 60);
    setHoursInput(`${h}:${m.toString().padStart(2, '0')}`);
    setNotesInput(event.subject);
    setJiraKeyInput('');
    setBillable(true);
    setFormError(null);
    setPendingOutlookEvent(event);
    setOutlookPickerOpen(false);
    setQuickAddOpen(true);
  };

  const closeQuickAdd = () => {
    setQuickAddOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleStartTimer = async () => {
    setFormError(null);
    if (projectId === '') {
      setFormError('Pick a project.');
      return;
    }
    if (projectTaskId === '') {
      setFormError('Pick a task.');
      return;
    }
    setTimerBusy(true);
    try {
      const entry = await startTimer({
        project_id: projectId as number,
        project_task_id: projectTaskId as number,
        date: activeDateStr,
        notes: notesInput.trim(),
        is_billable: billable,
        jira_issue_key: jiraKeyInput.trim(),
      });
      setRunningEntry(entry);
      setTickNow(Date.now());
      refetchEntries();
      setQuickAddOpen(false);
    } catch (err) {
      setFormError(extractApiError(err, 'Could not start timer.'));
    } finally {
      setTimerBusy(false);
    }
  };

  // Start a timer directly from a row in Today's/This week's entries — preset
  // project, task, notes, billable from the row so the user doesn't have to
  // re-pick them in the modal. If a timer is already running, stop it first
  // so the user gets a clean Harvest-style switch.
  const handleStartFromRow = async (entry: TimeEntry) => {
    setTimerBusy(true);
    try {
      if (runningEntry && runningEntry.id !== entry.id) {
        await stopTimer(runningEntry.id);
        setRunningEntry(null);
      }
      // Harvest behavior: resume the SAME entry as a running timer so its hours
      // accumulate on this row instead of creating a duplicate entry.
      const resumed = await resumeTimer(entry.id);
      setRunningEntry(resumed);
      setTickNow(Date.now());
      refetchEntries();
    } catch (err) {
      const msg = extractApiError(err, 'Could not start timer.');
      setFormError(msg);
      await ask({ title: 'Could not start timer', message: msg, tone: 'warning', confirmLabel: 'OK' });
    } finally {
      setTimerBusy(false);
    }
  };

  // Lock state derived from submission status.
  // - Approved: locked for everyone (must withdraw approval first to edit)
  // - Submitted: locked only for the member; managers/admins can still edit before approving
  const isOwnTimesheet = viewingUserId === null;
  const weekIsLocked =
    isOwnTimesheet &&
    !!activeSubmission &&
    (activeSubmission.status === 'approved' ||
      (activeSubmission.status === 'submitted' && role === 'member'));

  const handleSubmitWeek = async () => {
    setSubmissionError(null);
    setSubmissionBusy(true);
    try {
      const sub = await createSubmission({
        start_date: weekStartStr,
        end_date: weekEndStr,
      });
      setActiveSubmission(sub);
    } catch (err) {
      setSubmissionError(extractApiError(err, 'Could not submit week.'));
    } finally {
      setSubmissionBusy(false);
    }
  };

  const canApprove = role === 'owner' || role === 'admin' || role === 'manager';

  // Members can't see the Approval tab at all — defensive bounce back to Timesheet.
  useEffect(() => {
    if (!canApprove && activeTab === 'approval') setActiveTab('timesheet');
  }, [canApprove, activeTab]);

  // Custom range bounds — only meaningful when range === 'custom'. Picking a
  // date from the calendar popover sets both start and end to that date; a
  // future iteration can swap in a true two-date picker.
  const [approvalCustomStart, setApprovalCustomStart] = useState<Date | null>(null);
  const [approvalCustomEnd, setApprovalCustomEnd] = useState<Date | null>(null);

  // Date range derived from the Approval tab's own anchor + range selector.
  const approvalRangeBounds = useMemo(() => {
    if (approvalRange === 'all') return null;
    const anchor = new Date(approvalAnchor);
    anchor.setHours(0, 0, 0, 0);
    if (approvalRange === 'day') {
      const ymdStr = ymd(anchor);
      return {
        start: ymdStr,
        end: ymdStr,
        label: anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      };
    }
    if (approvalRange === 'week') {
      const start = startOfWeek(anchor, weekStartsOn);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return {
        start: ymd(start),
        end: ymd(end),
        label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      };
    }
    if (approvalRange === 'semimonth') {
      // 1st–15th or 16th–end of month, depending on which half the anchor falls in.
      const isFirstHalf = anchor.getDate() <= 15;
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), isFirstHalf ? 1 : 16);
      const end = isFirstHalf
        ? new Date(anchor.getFullYear(), anchor.getMonth(), 15)
        : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      return {
        start: ymd(start),
        end: ymd(end),
        label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      };
    }
    if (approvalRange === 'quarter') {
      const q = Math.floor(anchor.getMonth() / 3);
      const start = new Date(anchor.getFullYear(), q * 3, 1);
      const end = new Date(anchor.getFullYear(), q * 3 + 3, 0);
      return {
        start: ymd(start),
        end: ymd(end),
        label: `Q${q + 1} ${anchor.getFullYear()} (${start.toLocaleDateString('en-US', { month: 'short' })}–${end.toLocaleDateString('en-US', { month: 'short' })})`,
      };
    }
    if (approvalRange === 'custom') {
      if (!approvalCustomStart || !approvalCustomEnd) {
        return { start: '', end: '', label: 'Pick dates…' };
      }
      return {
        start: ymd(approvalCustomStart),
        end: ymd(approvalCustomEnd),
        label: `${approvalCustomStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${approvalCustomEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      };
    }
    // month
    const monthStart = new Date(anchor);
    monthStart.setDate(1);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthStart.getMonth() + 1);
    monthEnd.setDate(0);
    return {
      start: ymd(monthStart),
      end: ymd(monthEnd),
      label: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }, [approvalRange, approvalAnchor, approvalCustomStart, approvalCustomEnd]);

  const shiftApprovalAnchor = (delta: number) => {
    setApprovalAnchor((cur) => {
      const next = new Date(cur);
      if (approvalRange === 'day') next.setDate(cur.getDate() + delta);
      else if (approvalRange === 'week') next.setDate(cur.getDate() + delta * 7);
      else if (approvalRange === 'semimonth') next.setDate(cur.getDate() + delta * 15);
      else if (approvalRange === 'month') next.setMonth(cur.getMonth() + delta);
      else if (approvalRange === 'quarter') next.setMonth(cur.getMonth() + delta * 3);
      return next;
    });
  };

  const setApprovalAnchorToDate = (d: Date) => {
    const next = new Date(d);
    next.setHours(0, 0, 0, 0);
    setApprovalAnchor(next);
    if (approvalRange === 'custom') {
      setApprovalCustomStart(next);
      setApprovalCustomEnd(next);
    }
  };

  const handleWithdrawApprovalAtTopLevel = async () => {
    const approvedRows = pendingSubmissions.filter((s) => s.status === 'approved');
    if (approvedRows.length === 0) return;
    if (
      !(await ask({
        title: 'Withdraw approval?',
        message: `This will revert ${approvedRows.length} approved ${approvedRows.length === 1 ? 'submission' : 'submissions'} back to pending so they can be re-decided.`,
        tone: 'warning',
        confirmLabel: 'Withdraw approval',
      }))
    )
      return;
    setApprovalError(null);
    try {
      for (const s of approvedRows) {
        await unapproveSubmission(s.id);
      }
      refetchPendingSubmissions();
    } catch (err) {
      setApprovalError(extractApiError(err, 'Could not withdraw approval.'));
    }
  };

  const buildApprovalParams = () => {
    const params: {
      status?: 'submitted' | 'approved' | 'rejected';
      user_id?: number;
      start_date?: string;
      end_date?: string;
    } = {};
    if (approvalStatus !== 'all') params.status = approvalStatus;
    if (approvalTeammate !== 'all') params.user_id = approvalTeammate;
    if (approvalRangeBounds) {
      params.start_date = approvalRangeBounds.start;
      params.end_date = approvalRangeBounds.end;
    }
    return params;
  };

  const refetchPendingSubmissions = () => {
    setApprovalLoading(true);
    setApprovalError(null);
    listSubmissions(buildApprovalParams())
      .then((rows) => setPendingSubmissions(rows))
      .catch((err) =>
        setApprovalError(extractApiError(err, 'Could not load submissions.')),
      )
      .finally(() => setApprovalLoading(false));
  };

  // Load the approval queue when entering the Approval tab or when filters change.
  useEffect(() => {
    if (activeTab !== 'approval' || !canApprove) return;
    let cancelled = false;
    setApprovalLoading(true);
    setApprovalError(null);
    listSubmissions(buildApprovalParams())
      .then((rows) => {
        if (cancelled) return;
        setPendingSubmissions(rows);
      })
      .catch((err) => {
        if (!cancelled) setApprovalError(extractApiError(err, 'Could not load submissions.'));
      })
      .finally(() => {
        if (!cancelled) setApprovalLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canApprove, user?.id, approvalStatus, approvalRange, approvalTeammate, approvalRangeBounds?.start, approvalRangeBounds?.end]);

  const handleApprove = async (submission: Submission) => {
    setDecidingId(submission.id);
    setApprovalError(null);
    try {
      await approveSubmission(submission.id);
      refetchPendingSubmissions();
      // If the approved week is the one currently shown on the Timesheet, refresh
      // its banner so it flips from "Submitted" to "Approved" without a reload.
      if (
        activeSubmission?.id === submission.id ||
        (activeSubmission && activeSubmission.user_id === submission.user_id)
      ) {
        refetchActiveSubmission();
      }
    } catch (err) {
      setApprovalError(extractApiError(err, 'Could not approve.'));
    } finally {
      setDecidingId(null);
    }
  };

  const openReject = (submission: Submission) => {
    setRejectingId(submission.id);
    setRejectNote('');
  };

  const cancelReject = () => {
    setRejectingId(null);
    setRejectNote('');
  };

  const submitReject = async (submission: Submission) => {
    if (!rejectNote.trim()) {
      setApprovalError('Please add a short reason so the teammate knows what to fix.');
      return;
    }
    setDecidingId(submission.id);
    setApprovalError(null);
    try {
      await rejectSubmission(submission.id, { decision_note: rejectNote.trim() });
      refetchPendingSubmissions();
      if (
        activeSubmission?.id === submission.id ||
        (activeSubmission && activeSubmission.user_id === submission.user_id)
      ) {
        refetchActiveSubmission();
      }
      cancelReject();
    } catch (err) {
      setApprovalError(extractApiError(err, 'Could not reject.'));
    } finally {
      setDecidingId(null);
    }
  };

  const openSubmissionInTimesheet = (submission: Submission) => {
    setActiveTab('timesheet');
    setViewingUserId(submission.user_id);
    setCurrentDate(new Date(`${submission.start_date}T00:00:00`));
  };

  const handleWithdrawSubmission = async () => {
    if (!activeSubmission) return;
    const ok = await ask({
      title: 'Withdraw this submission?',
      message:
        'Your week will go back to draft and you can keep editing entries. Manager will not be notified.',
      tone: 'warning',
      confirmLabel: 'Withdraw',
    });
    if (!ok) return;
    setSubmissionError(null);
    setSubmissionBusy(true);
    try {
      await withdrawSubmission(activeSubmission.id);
      setActiveSubmission(null);
      refetchActiveSubmission();
    } catch (err) {
      setSubmissionError(extractApiError(err, 'Could not withdraw.'));
    } finally {
      setSubmissionBusy(false);
    }
  };

  // Manager/admin/owner action: undo an approval directly from the Timesheet
  // view. Mirrors the "Withdraw approval" footer on the Approval tab but saves
  // a tab switch when you've just approved your own (or someone's) timesheet.
  const handleWithdrawApprovalFromTimesheet = async () => {
    if (!activeSubmission || activeSubmission.status !== 'approved') return;
    const ok = await ask({
      title: 'Withdraw approval?',
      message:
        'This will unlock the entries and return the submission to pending so it can be re-decided.',
      tone: 'warning',
      confirmLabel: 'Withdraw approval',
    });
    if (!ok) return;
    setSubmissionError(null);
    setSubmissionBusy(true);
    try {
      await unapproveSubmission(activeSubmission.id);
      refetchActiveSubmission();
    } catch (err) {
      setSubmissionError(extractApiError(err, 'Could not withdraw approval.'));
    } finally {
      setSubmissionBusy(false);
    }
  };

  // ---- Week grid helpers ----
  const cellKey = (projectId: number, taskId: number, dayIdx: number) =>
    `${projectId}:${taskId}:${dayIdx}`;

  const gridRows = useMemo(() => {
    const map = new Map<
      string,
      {
        project_id: number;
        project_task_id: number;
        project_name: string;
        client_name: string;
        task_name: string;
        is_billable: boolean;
      }
    >();
    for (const e of weekEntries) {
      if (e.user_id !== effectiveUserId) continue;
      const key = `${e.project_id}:${e.project_task_id}`;
      if (!map.has(key)) {
        map.set(key, {
          project_id: e.project_id,
          project_task_id: e.project_task_id,
          project_name: e.project_name,
          client_name: e.client_name,
          task_name: e.task_name,
          is_billable: e.is_billable,
        });
      }
    }
    // Append manually-added rows that don't already have entries.
    for (const row of addedRows) {
      const key = `${row.project_id}:${row.project_task_id}`;
      if (!map.has(key)) map.set(key, row);
    }
    return Array.from(map.values());
  }, [weekEntries, addedRows, effectiveUserId]);

  const getCellEntries = (projectId: number, taskId: number, dayIdx: number) => {
    const date = ymd(weekDays[dayIdx].date);
    return weekEntries.filter(
      (e) =>
        e.user_id === effectiveUserId &&
        e.project_id === projectId &&
        e.project_task_id === taskId &&
        e.date === date,
    );
  };

  const getCellSum = (projectId: number, taskId: number, dayIdx: number) =>
    getCellEntries(projectId, taskId, dayIdx).reduce((sum, e) => sum + num(e.hours), 0);

  const getCellValue = (projectId: number, taskId: number, dayIdx: number): string => {
    const k = cellKey(projectId, taskId, dayIdx);
    if (editedCells.has(k)) return editedCells.get(k) ?? '';
    const sum = getCellSum(projectId, taskId, dayIdx);
    return sum > 0 ? formatHours(sum) : '';
  };

  const updateCell = (projectId: number, taskId: number, dayIdx: number, value: string) => {
    const k = cellKey(projectId, taskId, dayIdx);
    setEditedCells((prev) => {
      const next = new Map(prev);
      next.set(k, value);
      return next;
    });
  };

  const removeGridRow = (projectId: number, taskId: number) => {
    setAddedRows((prev) =>
      prev.filter((r) => !(r.project_id === projectId && r.project_task_id === taskId)),
    );
    // Drop any pending edits for that row.
    setEditedCells((prev) => {
      const next = new Map(prev);
      for (const k of Array.from(next.keys())) {
        if (k.startsWith(`${projectId}:${taskId}:`)) next.delete(k);
      }
      return next;
    });
  };

  const parseGridHours = (input: string): number => {
    const s = input.trim();
    if (!s) return 0;
    if (s.includes(':')) {
      const [h, m] = s.split(':');
      return Math.max(0, Number.parseInt(h || '0', 10) + (Number.parseInt(m || '0', 10) || 0) / 60);
    }
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const handleSaveGrid = async () => {
    if (editedCells.size === 0) return;
    setGridSaving(true);
    setFormError(null);
    try {
      for (const [k, value] of editedCells) {
        const [pidStr, tidStr, dStr] = k.split(':');
        const projectId = Number(pidStr);
        const taskId = Number(tidStr);
        const dayIdx = Number(dStr);
        const date = ymd(weekDays[dayIdx].date);
        const newHours = parseGridHours(value);
        const existing = getCellEntries(projectId, taskId, dayIdx);

        if (newHours <= 0) {
          for (const e of existing) {
            await deleteTimeEntry(e.id);
          }
        } else if (existing.length === 0) {
          const row = gridRows.find(
            (r) => r.project_id === projectId && r.project_task_id === taskId,
          );
          await createTimeEntry({
            project_id: projectId,
            project_task_id: taskId,
            date,
            hours: newHours,
            notes: '',
            is_billable: row?.is_billable ?? true,
          });
        } else {
          await updateTimeEntry(existing[0].id, { hours: newHours });
          // Collapse extras into the first entry by deleting them.
          for (const e of existing.slice(1)) {
            await deleteTimeEntry(e.id);
          }
        }
      }
      setEditedCells(new Map());
      setAddedRows([]);
      refetchEntries();
    } catch (err) {
      setFormError(extractApiError(err, 'Could not save grid changes.'));
    } finally {
      setGridSaving(false);
    }
  };

  const openGridAddRow = async () => {
    setGridAddOpen(true);
    setGridAddProjectId('');
    setGridAddTaskId('');
    setGridAddTasks([]);
  };

  const onGridAddProjectChange = async (pid: number) => {
    setGridAddProjectId(pid);
    setGridAddTaskId('');
    try {
      const tasks = await listProjectTasks(pid);
      setGridAddTasks(tasks);
    } catch {
      setGridAddTasks([]);
    }
  };

  const confirmAddGridRow = () => {
    if (gridAddProjectId === '' || gridAddTaskId === '') return;
    const project = projects.find((p) => p.id === gridAddProjectId);
    const task = gridAddTasks.find((t) => t.id === gridAddTaskId);
    if (!project || !task) return;
    setAddedRows((prev) => [
      ...prev,
      {
        project_id: project.id,
        project_task_id: task.id,
        project_name: project.name,
        client_name: project.client_name,
        task_name: task.task_name,
        is_billable: task.is_billable,
      },
    ]);
    setGridAddOpen(false);
  };

  const handleStopTimer = async () => {
    if (!runningEntry) return;
    setTimerBusy(true);
    setFormError(null);
    try {
      await stopTimer(runningEntry.id);
      setRunningEntry(null);
      refetchEntries();
      resetForm();
    } catch (err) {
      setFormError(extractApiError(err, 'Could not stop timer.'));
    } finally {
      setTimerBusy(false);
    }
  };

  const handleDelete = async (entry: TimeEntry) => {
    const ok = await ask({
      title: 'Delete this entry?',
      message: `${formatHours(num(entry.hours))} on ${entry.project_name} will be removed.`,
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteTimeEntry(entry.id);
      refetchEntries();
      if (editingId === entry.id) resetForm();
    } catch (err) {
      alert(extractApiError(err, 'Could not delete entry.'));
    }
  };

  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedTask = projectTasks.find((p) => p.id === projectTaskId);

  return (
    <div className="min-h-screen bg-bg pb-12">
      {confirmDialog}
      <PageHero
        eyebrow="Workspace"
        title="Time"
        description="Track hours against projects, monitor your week, and submit timesheets for approval."
      />

      {/* Tabs — quiet text-only, Harvest-style */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          {(['timesheet', 'approval'] as const)
            .filter((t) => t !== 'approval' || canApprove)
            .map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                className={`relative px-1 py-3 text-sm font-medium capitalize transition ${
                  activeTab === t ? 'text-text' : 'text-muted hover:text-text'
                }`}
              >
                {t}
                {activeTab === t ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-sm bg-primary" />
                ) : null}
              </button>
            ))}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
        {activeTab === 'approval' && canApprove ? (
            <ApprovalPanel
              submissions={pendingSubmissions}
              loading={approvalLoading}
              error={approvalError}
              decidingId={decidingId}
              rejectingId={rejectingId}
              rejectNote={rejectNote}
              currentUserId={user?.id}
              currentUserRole={role}
              statusFilter={approvalStatus}
              rangeFilter={approvalRange}
              teammateFilter={approvalTeammate}
              groupBy={approvalGroupBy}
              roleFilter={approvalRoleFilter}
              clientFilter={approvalClientId}
              projectFilter={approvalProjectId}
              rangeLabel={approvalRangeBounds?.label ?? 'All time'}
              teammates={teammates}
              projects={projects}
              onChangeStatus={setApprovalStatus}
              onChangeRange={setApprovalRange}
              onChangeTeammate={setApprovalTeammate}
              onChangeGroupBy={setApprovalGroupBy}
              onChangeRoleFilter={setApprovalRoleFilter}
              onChangeClient={setApprovalClientId}
              onChangeProject={setApprovalProjectId}
              onShiftAnchor={shiftApprovalAnchor}
              anchorDate={approvalAnchor}
              onPickAnchor={setApprovalAnchorToDate}
              calendarOpen={approvalCalendarOpen}
              onToggleCalendar={() => setApprovalCalendarOpen((o) => !o)}
              onCloseCalendar={() => setApprovalCalendarOpen(false)}
              onWithdrawApproval={handleWithdrawApprovalAtTopLevel}
              onApprove={handleApprove}
              onOpenReject={openReject}
              onCancelReject={cancelReject}
              onChangeRejectNote={setRejectNote}
              onSubmitReject={submitReject}
              onOpenInTimesheet={openSubmissionInTimesheet}
              onRefresh={refetchPendingSubmissions}
            />
        ) : (
          <>
            {/* Date controls */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => shift(-1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-muted transition hover:bg-slate-50"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shift(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-muted transition hover:bg-slate-50"
                  aria-label="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="relative ml-2">
                  <button
                    type="button"
                    onClick={() => setCalendarOpen((o) => !o)}
                    className="flex items-baseline gap-2 rounded-md px-2 py-1 transition hover:bg-slate-50"
                  >
                    <h2 className="font-heading text-xl font-bold text-text">{primary}</h2>
                    <span className="text-base font-medium text-text/70">{secondary}</span>
                    <ChevronDown className="h-4 w-4 text-text/70" />
                  </button>
                  {calendarOpen ? (
                    <CalendarPopover
                      value={currentDate}
                      onSelect={(d) => {
                        setCurrentDate(d);
                        setCalendarOpen(false);
                      }}
                      onClose={() => setCalendarOpen(false)}
                    />
                  ) : null}
                </div>
                {activeSubmission && activeSubmission.status === 'submitted' ? (
                  <>
                    <span
                      className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary"
                      title={`Submitted ${new Date(activeSubmission.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · entries locked`}
                    >
                      Pending approval
                    </span>
                    {isOwnTimesheet ? (
                      <button
                        type="button"
                        onClick={handleWithdrawSubmission}
                        disabled={submissionBusy}
                        className="ml-1 inline-flex items-center rounded-md border border-primary/30 bg-white px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary-soft disabled:opacity-50"
                      >
                        {submissionBusy ? 'Withdrawing…' : 'Withdraw'}
                      </button>
                    ) : null}
                  </>
                ) : activeSubmission && activeSubmission.status === 'approved' ? (
                  <>
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent-dark">
                      Approved
                    </span>
                    {canApprove ? (
                      <button
                        type="button"
                        onClick={handleWithdrawApprovalFromTimesheet}
                        disabled={submissionBusy}
                        className="ml-1 inline-flex items-center rounded-md border border-primary/30 bg-white px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary-soft disabled:opacity-50"
                      >
                        {submissionBusy ? 'Withdrawing…' : 'Withdraw approval'}
                      </button>
                    ) : null}
                  </>
                ) : activeSubmission && activeSubmission.status === 'rejected' ? (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-danger">
                    Rejected
                  </span>
                ) : null}
                {(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return !sameDay(currentDate, today) ? (
                    <button
                      type="button"
                      onClick={goToday}
                      className="ml-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Return to today
                    </button>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={goToday}
                  className="ml-2 hidden items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-slate-50 hover:text-text sm:inline-flex"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Jump to today
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div
                  role="tablist"
                  aria-label="Timesheet view"
                  className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1"
                >
                  {(['day', 'week'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={`rounded-md px-5 py-1.5 text-sm font-bold capitalize transition ${
                        view === v
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-muted hover:bg-slate-200/60 hover:text-text'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {canSeeTeammates ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setTeammatesMenuOpen((o) => !o)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition ${
                        viewingUserId !== null
                          ? 'border-primary bg-primary-soft text-primary'
                          : 'border-slate-200 bg-white text-text hover:bg-slate-50'
                      }`}
                    >
                      <Users className={`h-4 w-4 ${viewingUserId !== null ? 'text-primary' : 'text-muted'}`} />
                      {viewingUserId === null
                        ? 'Your timesheet'
                        : teammates.find((u) => u.id === viewingUserId)?.full_name ?? 'Teammate'}
                      <ChevronDown className="h-4 w-4 text-muted" />
                    </button>
                    {teammatesMenuOpen ? (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setTeammatesMenuOpen(false)}
                          aria-hidden="true"
                        />
                        <div className="absolute left-0 z-20 mt-1 max-h-72 w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg sm:left-auto sm:right-0">
                          <button
                            type="button"
                            onClick={() => {
                              setViewingUserId(null);
                              setTeammatesMenuOpen(false);
                            }}
                            className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-bg ${
                              viewingUserId === null
                                ? 'bg-primary-soft/40 font-semibold text-primary'
                                : 'text-text'
                            }`}
                          >
                            Your timesheet
                          </button>
                          {teammates.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-muted">No teammates yet.</p>
                          ) : (
                            <>
                              <p className="border-t border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                                View teammate
                              </p>
                              {teammates.map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    setViewingUserId(u.id);
                                    setTeammatesMenuOpen(false);
                                  }}
                                  className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-bg ${
                                    viewingUserId === u.id
                                      ? 'bg-primary-soft/40 font-semibold text-primary'
                                      : 'text-text'
                                  }`}
                                >
                                  <span className="block">{u.full_name || u.email}</span>
                                  <span className="block text-xs text-muted">{u.email}</span>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Week chips — Harvest hides this in Week view (the entries
                table itself has day columns), so we do the same. */}
            {view !== 'week' ? (
              <div className="overflow-hidden">
                <WeekBar
                  days={weekDays}
                  activeDate={currentDate}
                  onSelectDay={setCurrentDate}
                  isDateLocked={(d) => {
                    if (!activeSubmission || activeSubmission.status === 'rejected') return false;
                    const dStr = ymd(d);
                    return (
                      dStr >= activeSubmission.start_date && dStr <= activeSubmission.end_date
                    );
                  }}
                />
              </div>
            ) : null}

            {viewingUserId !== null ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft/60 px-4 py-3 text-sm">
                <span className="text-text">
                  Viewing{' '}
                  <strong className="font-semibold text-primary">
                    {teammates.find((u) => u.id === viewingUserId)?.full_name ?? 'teammate'}
                  </strong>
                  's timesheet — edits and deletes apply to their entries.
                </span>
                <button
                  type="button"
                  onClick={() => setViewingUserId(null)}
                  className="rounded-md border border-primary/30 bg-white px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary-soft"
                >
                  Switch back to your own
                </button>
              </div>
            ) : null}

            {activeSubmission && activeSubmission.status === 'rejected' && view !== 'week' ? (
              <SubmissionStatusBanner
                submission={activeSubmission}
                canWithdraw={false}
                busy={submissionBusy}
                onWithdraw={handleWithdrawSubmission}
              />
            ) : null}

            {submissionError ? (
              <div className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {submissionError}
              </div>
            ) : null}

            {/* Outlook integration banner — Connect or Pull-in event (Epic 8) */}
            {viewingUserId === null && outlookStatus && view !== 'week' ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-heading text-sm font-bold text-text">Outlook calendar</p>
                    <p className="text-xs text-text/70">
                      {outlookStatus.connected
                        ? `Connected as ${outlookStatus.email || 'your account'}`
                        : outlookStatus.configured
                          ? 'Pull calendar events into your timesheet.'
                          : 'Outlook integration is not configured on this server.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {outlookStatus.connected ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setOutlookPickerOpen(true)}
                        disabled={!!weekIsLocked}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-bold text-text shadow-sm transition hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                        title={weekIsLocked ? 'This week is locked.' : undefined}
                      >
                        <Calendar className="h-4 w-4" />
                        Pull in a calendar event
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectOutlook}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-muted transition hover:bg-slate-50"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : outlookStatus.configured ? (
                    <button
                      type="button"
                      onClick={handleConnectOutlook}
                      disabled={outlookConnecting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-60"
                    >
                      <Mail className="h-4 w-4" />
                      {outlookConnecting ? 'Redirecting…' : 'Connect to Outlook'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {outlookFlash ? (
              <div
                className={`mt-3 flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm ${
                  outlookFlash.kind === 'ok'
                    ? 'bg-accent-soft text-accent-dark'
                    : 'bg-danger/10 text-danger'
                }`}
              >
                <span>{outlookFlash.msg}</span>
                <button
                  type="button"
                  onClick={() => setOutlookFlash(null)}
                  className="text-xs font-semibold underline hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            {/* Action row — Harvest-style + Track time button. Hidden in Week
                view per spec: Week shows just the entries grid. */}
            {viewingUserId === null && !weekIsLocked && view !== 'week' ? (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={openQuickAdd}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-text shadow-sm transition hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <Plus className="h-4 w-4" />
                  Track time
                </button>
                <p className="text-sm text-text/80">
                  Click <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-semibold">+ Track time</kbd> or press the same row to log a manual entry or start a timer.
                </p>
              </div>
            ) : null}

            {/* Single-column main */}
            <div className="mt-4 grid gap-6 lg:grid-cols-1">
              {/* Quick-add modal — opens via + Track time or row Edit */}
              {quickAddOpen ? (
              <aside className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4">
                <button
                  type="button"
                  className="absolute inset-0 cursor-default"
                  onClick={closeQuickAdd}
                  aria-label="Close"
                />
                <section className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                    <div>
                      <h3 className="font-heading text-base font-bold text-text">
                        {editingId !== null ? 'Edit entry' : `New time entry for ${secondary}`}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeQuickAdd}
                      className="-mr-2 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-white/60 hover:text-text"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4 p-5">
                    {runningEntry ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft/60 px-3 py-2.5">
                        <div>
                          <p className="font-mono text-xl font-bold tabular-nums text-accent-dark">
                            {formatTimerElapsed(runningEntry, tickNow)}
                          </p>
                          <p className="text-[11px] text-muted">
                            Running on <strong className="text-text">{runningEntry.project_name}</strong>{' · '}{runningEntry.task_name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleStopTimer}
                          disabled={timerBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-danger/90 disabled:opacity-50"
                        >
                          <Pause className="h-3.5 w-3.5" />
                          {timerBusy ? 'Stopping…' : 'Stop timer'}
                        </button>
                      </div>
                    ) : null}

                    {/* Project picker */}
                    <div className="block">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Project
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setProjectMenuOpen((o) => !o)}
                          className={`mt-1 inline-flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-sm transition hover:border-slate-300 ${
                            selectedProject ? 'border-slate-300 text-text' : 'border-slate-200 text-muted'
                          }`}
                        >
                          {selectedProject
                            ? `${selectedProject.client_name} · ${selectedProject.name}`
                            : 'Choose a project…'}
                          <ChevronDown className="h-4 w-4 text-muted" />
                        </button>
                        {projectMenuOpen ? (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setProjectMenuOpen(false)}
                              aria-hidden="true"
                            />
                            <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                              {projects.length === 0 ? (
                                <div className="px-3 py-3 text-sm text-muted">
                                  No projects yet.
                                </div>
                              ) : (
                                projects.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setProjectId(p.id);
                                      setProjectMenuOpen(false);
                                    }}
                                    className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-bg ${
                                      p.id === projectId ? 'bg-primary-soft/40 font-semibold text-primary' : 'text-text'
                                    }`}
                                  >
                                    <span className="block">{p.name}</span>
                                    <span className="block text-xs text-muted">
                                      {p.client_name}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {/* Task picker */}
                    <div className="block">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Task
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          disabled={projectId === ''}
                          onClick={() => setTaskMenuOpen((o) => !o)}
                          className={`mt-1 inline-flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-sm transition hover:border-slate-300 ${
                            projectId === ''
                              ? 'cursor-not-allowed border-slate-200 text-muted/60'
                              : selectedTask
                                ? 'border-slate-300 text-text'
                                : 'border-slate-200 text-muted'
                          }`}
                        >
                          {projectId === ''
                            ? 'Pick a project first…'
                            : selectedTask
                              ? selectedTask.task_name
                              : 'Choose a task…'}
                          <ChevronDown className="h-4 w-4 text-muted" />
                        </button>
                        {taskMenuOpen ? (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setTaskMenuOpen(false)}
                              aria-hidden="true"
                            />
                            <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                              {projectTasks.length === 0 ? (
                                <div className="px-3 py-3 text-sm text-muted">
                                  No tasks on this project yet.
                                </div>
                              ) : (
                                projectTasks.map((pt) => (
                                  <button
                                    key={pt.id}
                                    type="button"
                                    onClick={() => {
                                      setProjectTaskId(pt.id);
                                      setTaskMenuOpen(false);
                                    }}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-bg ${
                                      pt.id === projectTaskId ? 'bg-primary-soft/40 font-semibold text-primary' : 'text-text'
                                    }`}
                                  >
                                    <span>{pt.task_name}</span>
                                    {pt.is_billable ? (
                                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-dark">
                                        Billable
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-text/70">
                                        Non-billable
                                      </span>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {timerMode === 'start_end' ? (
                      // Harvest start/end layout: Notes full-width above, Start to End = Total row below.
                      <div className="space-y-3">
                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                            Notes <span className="font-normal normal-case text-muted/70">(optional)</span>
                          </span>
                          <textarea
                            rows={3}
                            value={notesInput}
                            onChange={(e) => setNotesInput(e.target.value)}
                            placeholder="What did you work on?"
                            className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="time"
                            value={startTimeInput}
                            onChange={(e) => {
                              setStartTimeInput(e.target.value);
                              if (endTimeInput) {
                                setHoursInput(hoursFromStartEnd(e.target.value, endTimeInput));
                              }
                            }}
                            placeholder="Start time"
                            aria-label="Start time"
                            className="w-32 rounded-lg border border-slate-200 px-3 py-2.5 text-center text-sm font-mono text-text transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <span className="text-sm text-muted">to</span>
                          <input
                            type="time"
                            value={endTimeInput}
                            onChange={(e) => {
                              setEndTimeInput(e.target.value);
                              if (startTimeInput) {
                                setHoursInput(hoursFromStartEnd(startTimeInput, e.target.value));
                              }
                            }}
                            placeholder="End time"
                            aria-label="End time"
                            className="w-32 rounded-lg border border-slate-200 px-3 py-2.5 text-center text-sm font-mono text-text transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <span className="text-sm text-muted">=</span>
                          <input
                            type="text"
                            value={
                              hoursInput
                                ? formatHoursDisplay(Number.parseFloat(hoursInput) || 0, 'hh_mm')
                                : '0:00'
                            }
                            readOnly
                            aria-label="Duration"
                            className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-sm font-mono font-semibold text-text"
                          />
                        </div>
                      </div>
                    ) : (
                      // Duration mode: Notes + Hours side-by-side (original Harvest layout).
                      <div className="grid grid-cols-[1fr_7rem] gap-3">
                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                            Notes <span className="font-normal normal-case text-muted/70">(optional)</span>
                          </span>
                          <textarea
                            rows={3}
                            value={notesInput}
                            onChange={(e) => setNotesInput(e.target.value)}
                            placeholder="What did you work on?"
                            className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                            Hours
                          </span>
                          <input
                            type="text"
                            value={hoursInput}
                            onChange={(e) => setHoursInput(e.target.value)}
                            placeholder="0:00"
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-center text-sm font-mono text-text transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                      </div>
                    )}

                    {formError ? (
                      <div className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
                        {formError}
                      </div>
                    ) : null}

                    {/* Footer actions */}
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={closeQuickAdd}
                        className="btn-outline"
                      >
                        Cancel
                      </button>
                      {editingId === null && !runningEntry ? (
                        <button
                          type="button"
                          onClick={handleStartTimer}
                          disabled={timerBusy}
                          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-white px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary-soft/60 disabled:opacity-50"
                        >
                          <Play className="h-4 w-4" />
                          {timerBusy ? 'Starting…' : 'Start timer'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-primary gap-2 disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : (
                          <>
                            <Plus className="h-4 w-4" />
                            {editingId !== null ? 'Save changes' : 'Save entry'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </section>
              </aside>
              ) : null}

              {/* Entries */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-6">
                  <div>
                    <h3 className="font-heading text-xl font-bold text-text">
                      {view === 'week' ? "This week's entries" : `${primary}'s entries`}
                    </h3>
                    <p className="mt-1 text-base font-medium text-text/70">
                      {view === 'week'
                        ? `${weekDays[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : secondary}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-right sm:gap-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted">
                        Total
                      </p>
                      <p className="font-mono text-2xl font-bold tabular-nums text-primary">
                        {formatHours(view === 'week' ? weekTotal : dayTotal)}
                      </p>
                    </div>
                    <div className="h-12 w-px bg-slate-200" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-accent-dark">
                        Billable
                      </p>
                      <p className="font-mono text-2xl font-bold tabular-nums text-accent-dark">
                        {formatHours(view === 'week' ? weekBillable : dayBillable)}
                      </p>
                    </div>
                  </div>
                </div>

                {entriesLoading ? (
                  <div className="px-5 py-12 text-center text-sm text-muted">Loading entries…</div>
                ) : view === 'week' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] border-collapse text-base">
                      <thead>
                        <tr className="border-b-2 border-slate-200">
                          <th className="sticky left-0 z-10 w-[180px] min-w-[180px] max-w-[180px] bg-white px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700 sm:w-[220px] sm:min-w-[220px] sm:max-w-[220px] sm:px-5">
                            Project · Task
                          </th>
                          {weekDays.map((day) => {
                            const isActive = sameDay(day.date, currentDate);
                            return (
                              <th
                                key={ymd(day.date)}
                                className={`px-2 py-3 text-center ${
                                  isActive ? 'bg-primary-soft/50' : ''
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCurrentDate(day.date);
                                    setView('day');
                                  }}
                                  className="block w-full hover:opacity-80"
                                  title="Open day view"
                                >
                                  <span
                                    className={`block text-[11px] font-bold uppercase tracking-[0.08em] ${
                                      isActive ? 'text-primary' : 'text-slate-700'
                                    }`}
                                  >
                                    {day.label}
                                  </span>
                                  <span
                                    className={`mt-0.5 block text-base font-bold tabular-nums ${
                                      isActive ? 'text-primary' : 'text-text'
                                    }`}
                                  >
                                    {day.date.getDate()}
                                  </span>
                                </button>
                              </th>
                            );
                          })}
                          <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                            Total
                          </th>
                          <th className="w-8" aria-hidden="true" />
                        </tr>
                      </thead>
                      <tbody>
                        {gridRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={weekDays.length + 3}
                              className="px-5 py-12 text-center text-sm text-muted"
                            >
                              No rows yet — click <span className="font-semibold">+ Add row</span>{' '}
                              below to start, or use <span className="font-semibold">+ Track time</span>.
                            </td>
                          </tr>
                        ) : (
                          gridRows.map((row) => {
                            const rowTotal = weekDays.reduce((sum, _d, i) => {
                              const k = cellKey(row.project_id, row.project_task_id, i);
                              const v = editedCells.has(k)
                                ? parseGridHours(editedCells.get(k) ?? '')
                                : getCellSum(row.project_id, row.project_task_id, i);
                              return sum + v;
                            }, 0);
                            const isAdded = addedRows.some(
                              (r) =>
                                r.project_id === row.project_id &&
                                r.project_task_id === row.project_task_id,
                            );
                            return (
                              <tr
                                key={`${row.project_id}:${row.project_task_id}`}
                                className="border-b border-slate-100 last:border-b-0"
                              >
                                <td className="sticky left-0 z-10 w-[180px] min-w-[180px] max-w-[180px] bg-white px-4 py-4 sm:w-[220px] sm:min-w-[220px] sm:max-w-[220px] sm:px-5">
                                  <p className="text-sm font-bold text-text sm:text-base">
                                    {row.project_name}
                                  </p>
                                  <p className="text-xs font-medium text-muted">
                                    ({row.client_name})
                                  </p>
                                  <p className="mt-1 text-xs text-muted sm:text-sm">{row.task_name}</p>
                                </td>
                                {weekDays.map((day, i) => {
                                  const k = cellKey(row.project_id, row.project_task_id, i);
                                  const isActive = sameDay(day.date, currentDate);
                                  const isEdited = editedCells.has(k);
                                  return (
                                    <td
                                      key={k}
                                      className={`px-2 py-3 ${
                                        isActive ? 'bg-primary-soft/30' : ''
                                      }`}
                                    >
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={getCellValue(row.project_id, row.project_task_id, i)}
                                        onChange={(e) =>
                                          updateCell(
                                            row.project_id,
                                            row.project_task_id,
                                            i,
                                            e.target.value,
                                          )
                                        }
                                        disabled={weekIsLocked}
                                        placeholder="0:00"
                                        className={`w-full rounded-lg border-2 px-2 py-2.5 text-center font-mono text-base font-semibold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                                          isEdited
                                            ? 'border-accent bg-accent-soft/30 text-text'
                                            : 'border-slate-200 bg-white text-text hover:border-slate-300 focus:border-primary'
                                        } ${weekIsLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-3 text-right font-mono text-lg font-bold tabular-nums text-primary">
                                  {formatHours(rowTotal)}
                                </td>
                                <td className="px-2 py-3">
                                  {isAdded ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeGridRow(row.project_id, row.project_task_id)
                                      }
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                                      aria-label="Remove row"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50">
                          <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-muted sm:px-5">
                            Day total
                          </td>
                          {weekDays.map((day) => {
                            const isActive = sameDay(day.date, currentDate);
                            return (
                              <td
                                key={`total-${ymd(day.date)}`}
                                className={`px-2 py-3.5 text-center font-mono text-base font-bold tabular-nums ${
                                  isActive ? 'bg-primary-soft/30 text-primary' : 'text-text'
                                }`}
                              >
                                {formatHours(day.hours)}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3.5 text-right font-mono text-lg font-bold tabular-nums text-primary">
                            {formatHours(weekTotal)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>

                    {!weekIsLocked && viewingUserId === null ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={openGridAddRow}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-slate-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add row
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveGrid}
                            disabled={editedCells.size === 0 || gridSaving}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                              editedCells.size > 0
                                ? 'bg-accent text-text shadow-sm hover:bg-accent-dark'
                                : 'bg-slate-100 text-muted'
                            }`}
                          >
                            {gridSaving
                              ? 'Saving…'
                              : editedCells.size > 0
                                ? `Save (${editedCells.size})`
                                : 'Save'}
                          </button>
                        </div>
                        {editedCells.size > 0 ? (
                          <p className="text-xs text-muted">
                            Unsaved edits — click Save to commit.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : dayEntries.length === 0 ? (
                  <div className="px-5 py-12">
                    <div className="flex flex-col items-center text-center">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft">
                        <Clock className="h-7 w-7 text-primary" />
                      </span>
                      <h4 className="mt-5 font-heading text-lg font-bold text-text">
                        No time tracked yet
                      </h4>
                      <p className="mt-2 max-w-md text-sm text-muted">
                        Use the quick-add card on the left to log your first entry.
                      </p>
                      <blockquote className="mt-6 max-w-md border-l-4 border-accent pl-4 text-left">
                        <p className="text-sm italic text-text">
                          &ldquo;{emptyStateQuote.quote}&rdquo;
                        </p>
                        <footer className="mt-1 text-xs text-muted">
                          — {emptyStateQuote.author}
                        </footer>
                      </blockquote>
                    </div>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {dayEntries.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        editingId={editingId}
                        tickNow={tickNow}
                        timerBusy={timerBusy}
                        locked={weekIsLocked}
                        hasRunningTimer={runningEntry !== null}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onStop={handleStopTimer}
                        onStartFromRow={handleStartFromRow}
                      />
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/40 px-5 py-3.5">
                  <p className="text-sm font-medium text-text/80">
                    {view === 'week'
                      ? `${weekEntries.filter((e) => e.user_id === effectiveUserId).length} ${weekEntries.filter((e) => e.user_id === effectiveUserId).length === 1 ? 'entry' : 'entries'} this week`
                      : `${dayEntries.length} ${dayEntries.length === 1 ? 'entry' : 'entries'} on ${secondary}`}
                  </p>
                  <p className="text-sm font-medium text-text/80">{weekDays.length} days this week</p>
                </div>
              </section>
            </div>

            {/* Inline submit row — replaces the old sticky footer */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-text/70">
                    Day
                  </p>
                  <p className="mt-0.5 font-mono text-xl font-bold text-text tabular-nums">
                    {formatHours(dayTotal)}
                  </p>
                </div>
                <div className="h-12 w-px bg-slate-200" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary/80">
                    This week
                  </p>
                  <p className="mt-0.5 font-mono text-xl font-bold text-primary tabular-nums">
                    {formatHours(weekTotal)}
                  </p>
                </div>
                <div className="h-12 w-px bg-slate-200" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-accent-dark">
                    Billable
                  </p>
                  <p className="mt-0.5 font-mono text-xl font-bold text-accent-dark tabular-nums">
                    {formatHours(weekBillable)}
                  </p>
                </div>
              </div>

              <div className="relative">
                {isOwnTimesheet && activeSubmission?.status === 'submitted' ? (
                  <button
                    type="button"
                    onClick={handleWithdrawSubmission}
                    disabled={submissionBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-white px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary-soft disabled:opacity-50"
                  >
                    {submissionBusy ? 'Withdrawing…' : 'Withdraw submission'}
                  </button>
                ) : isOwnTimesheet && activeSubmission?.status === 'approved' ? (
                  <span className="inline-flex items-center gap-2 rounded-lg border-2 border-accent bg-accent-soft px-4 py-2.5 text-base font-bold text-accent-dark shadow-sm">
                    <Send className="h-4 w-4" />
                    Approved · locked
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmitWeek}
                    disabled={weekTotal === 0 || submissionBusy || !isOwnTimesheet}
                    className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      !isOwnTimesheet
                        ? 'Switch to your own timesheet to submit'
                        : weekTotal === 0
                          ? 'Log time first, then submit'
                          : 'Submit this week for approval'
                    }
                  >
                    <Send className="h-4 w-4" />
                    {submissionBusy
                      ? 'Submitting…'
                      : activeSubmission?.status === 'rejected'
                        ? 'Resubmit week'
                        : 'Submit week for approval'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Outlook event picker — opened from the Pull-in banner. */}
      {outlookPickerOpen ? (
        <OutlookEventPicker
          date={activeDateStr}
          onClose={() => setOutlookPickerOpen(false)}
          onPick={openQuickAddFromOutlook}
        />
      ) : null}

      {/* Week-grid Add row dialog */}
      {gridAddOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setGridAddOpen(false)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-primary-soft/40 px-5 py-3">
              <div>
                <h3 className="font-heading text-sm font-bold uppercase tracking-[0.18em] text-primary">
                  Add row
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Pick a project + task to add a new row to the week grid.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGridAddOpen(false)}
                className="-mr-2 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-white/60 hover:text-text"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Project
                </span>
                <select
                  value={gridAddProjectId}
                  onChange={(e) => onGridAddProjectChange(Number(e.target.value))}
                  className="input mt-1"
                >
                  <option value="">Choose a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.client_name} · {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Task
                </span>
                <select
                  value={gridAddTaskId}
                  onChange={(e) => setGridAddTaskId(Number(e.target.value))}
                  disabled={gridAddProjectId === ''}
                  className="input mt-1 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted"
                >
                  <option value="">
                    {gridAddProjectId === '' ? 'Pick a project first…' : 'Choose a task…'}
                  </option>
                  {gridAddTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.task_name}
                      {t.is_billable ? ' · billable' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGridAddOpen(false)}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmAddGridRow}
                  disabled={gridAddProjectId === '' || gridAddTaskId === ''}
                  className="btn-primary disabled:opacity-50"
                >
                  Add row
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
