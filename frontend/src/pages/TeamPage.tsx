import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mail,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import PageHero from '@/components/PageHero';
import { useConfirm } from '@/components/ConfirmDialog';
import { resendInvite } from '@/api/invites';
import {
  archiveTeamMember,
  deleteUser,
  listTeam,
  restoreTeamMember,
} from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import { startOfWeek as startOfWeekPref, useWeekStart } from '@/utils/preferences';
import type { WeekStart } from '@/api/accountSettings';
import type { Role, TeamMember } from '@/types';

type RoleFilter =
  | 'all'
  | 'active'
  | 'pending'
  | 'archived'
  | 'owner'
  | 'admin'
  | 'manager'
  | 'member';

const ROLE_BADGE: Record<Role, string> = {
  owner: 'bg-primary-soft text-primary',
  admin: 'bg-primary-soft text-primary',
  manager: 'bg-accent-soft text-accent-dark',
  member: 'bg-slate-100 text-muted',
};

const ROLE_FILTER_LABEL: Record<RoleFilter, string> = {
  all: 'Everyone',
  active: 'Active',
  pending: 'Pending invites',
  archived: 'Archived',
  owner: 'Owners',
  admin: 'Admins',
  manager: 'Managers',
  member: 'Members',
};

interface FilterSection {
  label: string | null;
  options: RoleFilter[];
}

const FILTER_SECTIONS: FilterSection[] = [
  { label: null, options: ['all'] },
  { label: 'Status', options: ['active', 'pending', 'archived'] },
  { label: 'Role', options: ['owner', 'admin', 'manager', 'member'] },
];

function startOfWeek(d: Date, weekStartsOn: WeekStart = 'monday'): Date {
  return startOfWeekPref(d, weekStartsOn);
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = sameMonth
    ? end.toLocaleDateString('en-US', { day: 'numeric' })
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = end.getFullYear();
  return `${startStr} – ${endStr}, ${year}`;
}

function isCurrentWeek(start: Date, weekStartsOn: WeekStart): boolean {
  const today = startOfWeek(new Date(), weekStartsOn);
  return start.getTime() === today.getTime();
}

export default function TeamPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { confirmDialog, ask } = useConfirm();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const weekStartsOn = useWeekStart();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), weekStartsOn));

  // Re-anchor when the workspace preference changes
  useEffect(() => {
    setWeekStart(startOfWeek(new Date(), weekStartsOn));
  }, [weekStartsOn]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTeam({ includePending: true, includeArchived: true })
      .then((data) => {
        if (cancelled) return;
        setMembers(data);
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiError(err, 'Failed to load team'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const isArchived = !m.is_active && !m.is_pending_invite;

      if (roleFilter === 'all') {
        if (isArchived) return false;
      } else if (roleFilter === 'active') {
        if (!m.is_active || m.is_pending_invite) return false;
      } else if (roleFilter === 'pending') {
        if (!m.is_pending_invite) return false;
      } else if (roleFilter === 'archived') {
        if (!isArchived) return false;
      } else {
        if (!m.is_active || m.role !== roleFilter) return false;
      }

      if (!q) return true;
      return (
        m.full_name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.employee_id.toLowerCase().includes(q) ||
        m.job_role_names.some((r) => r.toLowerCase().includes(q))
      );
    });
  }, [members, roleFilter, search]);

  const totals = useMemo(() => {
    const active = members.filter((m) => m.is_active);
    const totalCapacity = active.reduce(
      (sum, m) => sum + Number.parseFloat(m.weekly_capacity_hours || '0'),
      0,
    );
    const tracked = active.reduce(
      (sum, m) => sum + Number.parseFloat(m.tracked_hours_this_week || '0'),
      0,
    );
    const billable = active.reduce(
      (sum, m) => sum + Number.parseFloat(m.billable_hours_this_week || '0'),
      0,
    );
    return {
      tracked,
      billable,
      nonBillable: Math.max(tracked - billable, 0),
      capacity: totalCapacity,
    };
  }, [members]);

  const handleResend = async (member: TeamMember) => {
    setResendingId(member.id);
    setResendNotice(null);
    try {
      await resendInvite(member.id);
      setResendNotice(`Invite resent to ${member.email}.`);
    } catch (err) {
      setResendNotice(extractApiError(err, 'Could not resend.'));
    } finally {
      setResendingId(null);
    }
  };

  const handleEdit = (member: TeamMember) => {
    navigate(`/team/${member.id}/edit`);
  };

  const handleArchive = async (member: TeamMember) => {
    const ok = await ask({
      title: `Archive ${member.full_name || member.email}?`,
      message:
        'They will no longer be able to sign in or log time. Project memberships and historical entries are preserved. You can restore them later.',
      tone: 'warning',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    setBusyId(member.id);
    setResendNotice(null);
    try {
      const updated = await archiveTeamMember(member.id);
      setMembers((cur) =>
        cur.map((m) => (m.id === member.id ? { ...m, is_active: updated.is_active } : m)),
      );
      setResendNotice(`${member.full_name || member.email} has been archived.`);
    } catch (err) {
      setResendNotice(extractApiError(err, 'Could not archive.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (member: TeamMember) => {
    setBusyId(member.id);
    setResendNotice(null);
    try {
      const updated = await restoreTeamMember(member.id);
      setMembers((cur) =>
        cur.map((m) => (m.id === member.id ? { ...m, is_active: updated.is_active } : m)),
      );
      setResendNotice(`${member.full_name || member.email} has been restored.`);
    } catch (err) {
      setResendNotice(extractApiError(err, 'Could not restore.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (member: TeamMember) => {
    const ok = await ask({
      title: `Delete ${member.full_name || member.email}?`,
      message:
        'This permanently removes the user from your workspace. This cannot be undone. Their time entries will be detached.',
      tone: 'danger',
      confirmLabel: 'Delete forever',
    });
    if (!ok) return;
    setBusyId(member.id);
    setResendNotice(null);
    try {
      await deleteUser(member.id);
      setMembers((cur) => cur.filter((m) => m.id !== member.id));
      setResendNotice(`${member.full_name || member.email} has been deleted.`);
    } catch (err) {
      setResendNotice(extractApiError(err, 'Could not delete.'));
    } finally {
      setBusyId(null);
    }
  };

  const canDelete = currentUser?.role === 'owner';

  const shiftWeek = (delta: number) => {
    const next = new Date(weekStart);
    next.setDate(weekStart.getDate() + delta * 7);
    setWeekStart(next);
  };

  const goCurrentWeek = () => setWeekStart(startOfWeek(new Date(), weekStartsOn));

  return (
    <div className="min-h-screen bg-bg">
      {confirmDialog}
      <PageHero
        eyebrow="People"
        title="Team"
        description="Invite teammates, track utilization, and manage roles across your workspace."
        actions={
          <Link to="/team/invite" className="btn-primary">
            <UserPlus className="mr-2 h-4 w-4" />
            Invite person
          </Link>
        }
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Date range header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-muted transition hover:bg-slate-50"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-muted transition hover:bg-slate-50"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="ml-2 flex items-baseline gap-2">
              <h2 className="font-heading text-lg font-bold text-text">
                {isCurrentWeek(weekStart, weekStartsOn) ? 'This week' : 'Week of'}
              </h2>
              <span className="text-sm text-muted">{formatWeekRange(weekStart)}</span>
            </div>
            {!isCurrentWeek(weekStart, weekStartsOn) ? (
              <button
                type="button"
                onClick={goCurrentWeek}
                className="ml-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-slate-50 hover:text-text"
              >
                Current week
              </button>
            ) : null}
          </div>

          <RoleFilterDropdown
            value={roleFilter}
            onChange={setRoleFilter}
            open={filterOpen}
            setOpen={setFilterOpen}
          />
        </div>

        {/* Summary strip */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard label="Total hours" value={totals.tracked.toFixed(2)} accent="primary" />
          <SummaryCard
            label="Team capacity"
            value={totals.capacity.toFixed(2)}
            accent="muted"
            suffix="hr / week"
          />
          <BillableCard
            billable={totals.billable}
            nonBillable={totals.nonBillable}
            capacity={totals.capacity}
          />
        </div>

        {/* Toolbar */}
        <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="relative w-full flex-1 sm:min-w-[260px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, employee ID, or role…"
                className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <p className="text-xs text-muted">
              {filtered.length} {filtered.length === 1 ? 'person' : 'people'}
            </p>
          </div>
        </div>

        {resendNotice ? (
          <div className="mb-4 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-dark">
            {resendNotice}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
            Loading team…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState filter={roleFilter} hasSearch={search.length > 0} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[1fr_120px_120px_120px_120px_56px] items-center gap-3 border-b-2 border-slate-200 px-5 py-3 lg:grid">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                Employee
              </p>
              <p className="text-right text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                Hours
              </p>
              <p className="text-right text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                Utilization
              </p>
              <p className="text-right text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                Capacity
              </p>
              <p className="text-right text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                Billable
              </p>
              <span aria-hidden />
            </div>

            <ul className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  resending={resendingId === m.id}
                  busy={busyId === m.id}
                  canDelete={canDelete && m.role !== 'owner' && m.id !== currentUser?.id}
                  canArchive={m.role !== 'owner' && m.id !== currentUser?.id}
                  onResend={() => handleResend(m)}
                  onEdit={() => handleEdit(m)}
                  onArchive={() => handleArchive(m)}
                  onRestore={() => handleRestore(m)}
                  onDelete={() => handleDelete(m)}
                  actionsOpen={openActionsId === m.id}
                  onToggleActions={() =>
                    setOpenActionsId((cur) => (cur === m.id ? null : m.id))
                  }
                  onCloseActions={() => setOpenActionsId(null)}
                />
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

function RoleFilterDropdown({
  value, onChange, open, setOpen,
}: {
  value: RoleFilter;
  onChange: (v: RoleFilter) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-text shadow-sm transition hover:bg-slate-50"
      >
        {ROLE_FILTER_LABEL[value]}
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 z-20 mt-1 w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg sm:left-auto sm:right-0">
            {FILTER_SECTIONS.map((section, sIdx) => (
              <div
                key={section.label ?? `section-${sIdx}`}
                className={sIdx > 0 ? 'mt-1 border-t border-slate-100 pt-1' : ''}
              >
                {section.label ? (
                  <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {section.label}
                  </p>
                ) : null}
                {section.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-sm transition hover:bg-bg ${
                      opt === value ? 'bg-primary-soft/40 font-semibold text-primary' : 'text-text'
                    }`}
                  >
                    {ROLE_FILTER_LABEL[opt]}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label, value, accent, suffix,
}: {
  label: string;
  value: string;
  accent: 'primary' | 'muted';
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-1 font-heading text-2xl font-bold ${
          accent === 'primary' ? 'text-primary' : 'text-text'
        }`}
      >
        {value}
        {suffix ? <span className="ml-1 text-sm font-medium text-muted">{suffix}</span> : null}
      </p>
    </div>
  );
}

function BillableCard({
  billable, nonBillable, capacity,
}: {
  billable: number;
  nonBillable: number;
  capacity: number;
}) {
  const tracked = billable + nonBillable;
  const billablePct = capacity > 0 ? Math.min((billable / capacity) * 100, 100) : 0;
  const nonBillablePct = capacity > 0 ? Math.min((nonBillable / capacity) * 100, 100) : 0;
  const utilization = capacity > 0 ? Math.round((tracked / capacity) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Utilization</p>
        <p className="font-heading text-sm font-bold text-text">{utilization}%</p>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="flex h-full">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${billablePct}%` }}
            title={`Billable ${billable.toFixed(2)} hr`}
          />
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${nonBillablePct}%` }}
            title={`Non-billable ${nonBillable.toFixed(2)} hr`}
          />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          <span className="text-muted">Billable</span>
          <span className="font-semibold text-text">{billable.toFixed(2)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" />
          <span className="text-muted">Non-billable</span>
          <span className="font-semibold text-text">{nonBillable.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}

function MemberRow({
  member, resending, busy, canDelete, canArchive,
  onResend, onEdit, onArchive, onRestore, onDelete,
  actionsOpen, onToggleActions, onCloseActions,
}: {
  member: TeamMember;
  resending: boolean;
  busy: boolean;
  canDelete: boolean;
  canArchive: boolean;
  onResend: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  actionsOpen: boolean;
  onToggleActions: () => void;
  onCloseActions: () => void;
}) {
  const initial = (member.first_name?.[0] ?? member.email?.[0] ?? '?').toUpperCase();
  const roleLabel = member.role.charAt(0).toUpperCase() + member.role.slice(1);
  const tracked = Number.parseFloat(member.tracked_hours_this_week || '0');
  const billable = Number.parseFloat(member.billable_hours_this_week || '0');
  const capacity = Number.parseFloat(member.weekly_capacity_hours || '0');
  const utilization = capacity > 0 ? Math.round((tracked / capacity) * 100) : 0;
  const utilPct = capacity > 0 ? Math.min((tracked / capacity) * 100, 100) : 0;
  const actionsRef = useRef<HTMLDivElement>(null);
  const isArchived = !member.is_active && !member.is_pending_invite;

  return (
    <li
      className={`grid grid-cols-1 items-center gap-3 px-5 py-4 transition hover:bg-slate-50/60 lg:grid-cols-[1fr_120px_120px_120px_120px_56px] ${
        isArchived ? 'bg-slate-50/40' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full font-heading text-base font-bold ${
            isArchived
              ? 'bg-slate-200 text-muted'
              : member.is_pending_invite
                ? 'bg-slate-200 text-muted'
                : 'bg-primary text-white'
          } ${isArchived ? 'opacity-70' : ''}`}
        >
          {initial}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`font-heading text-sm font-bold ${
                isArchived ? 'text-muted' : 'text-text'
              }`}
            >
              {member.full_name || member.email}
            </p>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                ROLE_BADGE[member.role] ?? 'bg-slate-100 text-muted'
              }`}
            >
              {roleLabel}
            </span>
            {member.is_pending_invite ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                <Mail className="h-3 w-3" />
                Pending
              </span>
            ) : null}
            {isArchived ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-muted">
                <Archive className="h-3 w-3" />
                Archived
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {member.email}
            {member.employee_id ? ` · ${member.employee_id}` : ''}
          </p>
          {member.job_role_names.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {member.job_role_names.map((name) => (
                <span
                  key={name}
                  className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-text"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : null}
          {member.is_pending_invite ? (
            <div className="mt-1.5 lg:hidden">
              <PendingInline resending={resending} onResend={onResend} />
            </div>
          ) : null}
        </div>
      </div>

      {member.is_pending_invite ? (
        <div className="hidden lg:col-span-4 lg:flex lg:items-center lg:justify-end lg:gap-2">
          <PendingInline resending={resending} onResend={onResend} />
        </div>
      ) : isArchived ? (
        <div className="hidden lg:col-span-4 lg:flex lg:items-center lg:justify-end lg:gap-2">
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-dark transition hover:bg-accent/20 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            {busy ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2 lg:block lg:text-right">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted lg:hidden">
              Hours
            </span>
            <p className="font-heading text-sm font-bold text-text">{tracked.toFixed(2)}</p>
            <div className="mt-1 hidden h-1.5 w-full overflow-hidden rounded-full bg-slate-100 lg:block">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${utilPct}%` }}
              />
            </div>
          </div>
          <p className="flex items-baseline justify-between gap-2 text-sm font-semibold text-text lg:block lg:text-right">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted lg:hidden">
              Utilization
            </span>
            <span>{utilization}%</span>
          </p>
          <p className="flex items-baseline justify-between gap-2 text-sm text-text lg:block lg:text-right">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted lg:hidden">
              Capacity
            </span>
            <span>{capacity.toFixed(2)} hr</span>
          </p>
          <p className="flex items-baseline justify-between gap-2 text-sm text-text lg:block lg:text-right">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted lg:hidden">
              Billable
            </span>
            <span>{billable.toFixed(2)}</span>
          </p>
        </>
      )}

      <div className="relative flex items-center justify-end" ref={actionsRef}>
        <button
          type="button"
          onClick={onToggleActions}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-muted transition hover:bg-slate-50 hover:text-text"
          aria-label="Actions"
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {actionsOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={onCloseActions} aria-hidden="true" />
            <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              <button
                type="button"
                onClick={() => {
                  onCloseActions();
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition hover:bg-bg"
              >
                <Pencil className="h-3.5 w-3.5 text-muted" />
                Edit
              </button>
              {member.is_pending_invite ? (
                <button
                  type="button"
                  onClick={() => {
                    onCloseActions();
                    onResend();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition hover:bg-bg"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-muted" />
                  Resend invite
                </button>
              ) : null}
              {canArchive && !isArchived ? (
                <button
                  type="button"
                  onClick={() => {
                    onCloseActions();
                    onArchive();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition hover:bg-bg"
                >
                  <Archive className="h-3.5 w-3.5 text-muted" />
                  Archive
                </button>
              ) : null}
              {canArchive && isArchived ? (
                <button
                  type="button"
                  onClick={() => {
                    onCloseActions();
                    onRestore();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition hover:bg-bg"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-accent-dark" />
                  Restore
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    onCloseActions();
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition hover:bg-danger/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}

function PendingInline({
  resending, onResend,
}: {
  resending: boolean;
  onResend: () => void;
}) {
  return (
    <p className="text-xs text-muted">
      Hasn&apos;t signed in yet.{' '}
      <button
        type="button"
        onClick={onResend}
        disabled={resending}
        className="font-semibold text-primary hover:underline disabled:opacity-50"
      >
        {resending ? 'Resending…' : 'Resend invitation'}
      </button>
    </p>
  );
}

function EmptyState({ filter, hasSearch }: { filter: RoleFilter; hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-8 py-16 text-center shadow-sm">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <Search className="h-7 w-7 text-muted" />
        </span>
        <h2 className="mt-5 font-heading text-lg font-bold text-text">No matches</h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          Try a different name, email, or role.
        </p>
      </div>
    );
  }

  if (filter === 'pending') {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-8 py-16 text-center shadow-sm">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
          <Mail className="h-7 w-7 text-accent-dark" />
        </span>
        <h2 className="mt-5 font-heading text-lg font-bold text-text">No pending invites</h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          Everyone you&apos;ve invited has accepted and joined.
        </p>
      </div>
    );
  }

  if (filter === 'archived') {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-8 py-16 text-center shadow-sm">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <Archive className="h-7 w-7 text-muted" />
        </span>
        <h2 className="mt-5 font-heading text-lg font-bold text-text">No archived people</h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          Archived teammates show up here so you can restore them later.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-8 py-16 text-center shadow-sm">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
        <Users className="h-8 w-8 text-primary" />
      </span>
      <h2 className="mt-5 font-heading text-xl font-bold text-text">No teammates yet</h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        Invite your first teammate to start tracking time together.
      </p>
      <Link to="/team/invite" className="btn-primary mt-6">
        <UserPlus className="mr-2 h-4 w-4" />
        Invite person
      </Link>
    </div>
  );
}
