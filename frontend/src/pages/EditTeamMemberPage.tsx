import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Briefcase,
  ChevronDown,
  DollarSign,
  Lock,
  RotateCcw,
  Shield,
  Trash2,
  User as UserIcon,
  UserCheck,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import PageHero from '@/components/PageHero';
import { useConfirm } from '@/components/ConfirmDialog';
import { listJobRoles } from '@/api/jobRoles';
import {
  archiveTeamMember,
  deleteUser,
  getTeamMember,
  restoreTeamMember,
  updateTeamMember,
} from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import type {
  InviteRole,
  JobRole,
  TeamMemberDetail,
} from '@/types';

const NAME_RE = /^[\p{L}][\p{L}\s'’\-]*$/u;

interface PermissionOption {
  value: InviteRole;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    value: 'member',
    label: 'Member',
    description: 'Tracks time and submits timesheets.',
    icon: UserIcon,
  },
  {
    value: 'manager',
    label: 'Manager',
    description: 'Approves time and runs reports for projects they manage.',
    icon: UserCheck,
  },
  {
    value: 'admin',
    label: 'Administrator',
    description: 'Full control of projects, team, clients, and settings.',
    icon: Shield,
  },
];

export default function EditTeamMemberPage() {
  const { id } = useParams<{ id: string }>();
  const memberId = id ? Number.parseInt(id, 10) : NaN;
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { confirmDialog, ask } = useConfirm();

  const [member, setMember] = useState<TeamMemberDetail | null>(null);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [capacity, setCapacity] = useState('35');
  const [permission, setPermission] = useState<InviteRole>('member');
  const [selectedJobRoleIds, setSelectedJobRoleIds] = useState<number[]>([]);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [hourlyRate, setHourlyRate] = useState('');
  const [costRate, setCostRate] = useState('');

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(memberId)) {
      setLoadError('Invalid team member id');
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([getTeamMember(memberId), listJobRoles().catch(() => [] as JobRole[])])
      .then(([m, roles]) => {
        if (cancelled) return;
        setMember(m);
        setFirstName(m.first_name);
        setLastName(m.last_name);
        setEmail(m.email);
        setEmployeeId(m.employee_id || '');
        setCapacity(String(m.weekly_capacity_hours ?? '35'));
        setHourlyRate(m.hourly_rate != null ? String(m.hourly_rate) : '');
        setCostRate(m.cost_rate != null ? String(m.cost_rate) : '');
        setSelectedJobRoleIds(m.job_role_ids ?? []);
        setPermission(
          (m.role === 'owner' ? 'admin' : (m.role as InviteRole)) ?? 'member',
        );
        setJobRoles(roles);
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

  const isOwnerTarget = member?.role === 'owner';
  const isCurrentUser = !!currentUser && member?.id === currentUser.id;
  const canEditPermission = !isOwnerTarget;
  const canArchive = !isOwnerTarget && !isCurrentUser;
  const canDelete = currentUser?.role === 'owner' && !isOwnerTarget && !isCurrentUser;
  const canEditRates = currentUser?.role === 'owner' || currentUser?.role === 'admin';

  const selectedRoleNames = useMemo(
    () => jobRoles.filter((jr) => selectedJobRoleIds.includes(jr.id)).map((jr) => jr.name),
    [jobRoles, selectedJobRoleIds],
  );

  const validate = (): string | null => {
    if (!firstName.trim()) return 'First name is required';
    if (!NAME_RE.test(firstName.trim())) return 'First name contains invalid characters';
    if (!lastName.trim()) return 'Last name is required';
    if (!NAME_RE.test(lastName.trim())) return 'Last name contains invalid characters';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return 'Enter a valid work email';
    const cap = Number.parseFloat(capacity);
    if (Number.isNaN(cap) || cap <= 0 || cap > 168) return 'Capacity must be between 1 and 168';
    return null;
  };

  const toggleJobRole = (rid: number) => {
    setSelectedJobRoleIds((prev) =>
      prev.includes(rid) ? prev.filter((x) => x !== rid) : [...prev, rid],
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
    setServerError(null);
    setSuccessFlash(null);
    const err = validate();
    if (err) {
      setServerError(err);
      return;
    }
    setSaving(true);
    try {
      const ratePayload: { hourly_rate?: number; cost_rate?: number } = {};
      if (canEditRates) {
        const parsedHourly = hourlyRate.trim() === '' ? 0 : Number.parseFloat(hourlyRate);
        const parsedCost = costRate.trim() === '' ? 0 : Number.parseFloat(costRate);
        if (Number.isNaN(parsedHourly) || parsedHourly < 0) {
          setServerError('Billable rate must be a non-negative number.');
          setSaving(false);
          return;
        }
        if (Number.isNaN(parsedCost) || parsedCost < 0) {
          setServerError('Cost rate must be a non-negative number.');
          setSaving(false);
          return;
        }
        ratePayload.hourly_rate = parsedHourly;
        ratePayload.cost_rate = parsedCost;
      }
      const updated = await updateTeamMember(member.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        employee_id: employeeId.trim(),
        weekly_capacity_hours: Number.parseFloat(capacity),
        job_role_ids: selectedJobRoleIds,
        ...(canEditPermission ? { role: permission } : {}),
        ...ratePayload,
      });
      setMember(updated);
      setSuccessFlash('Changes saved.');
    } catch (e2) {
      setServerError(extractApiError(e2, 'Could not save changes.'));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!member) return;
    const ok = await ask({
      title: `Archive ${member.full_name || member.email}?`,
      message:
        'They will no longer be able to sign in or log time. Active project memberships and historical entries are preserved. You can restore them later.',
      tone: 'warning',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    setBusy(true);
    setServerError(null);
    try {
      const updated = await archiveTeamMember(member.id);
      setMember(updated);
      setSuccessFlash(`${updated.full_name || updated.email} has been archived.`);
    } catch (e) {
      setServerError(extractApiError(e, 'Could not archive.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!member) return;
    setBusy(true);
    setServerError(null);
    try {
      const updated = await restoreTeamMember(member.id);
      setMember(updated);
      setSuccessFlash(`${updated.full_name || updated.email} has been restored.`);
    } catch (e) {
      setServerError(extractApiError(e, 'Could not restore.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!member) return;
    const ok = await ask({
      title: `Delete ${member.full_name || member.email}?`,
      message:
        'This permanently removes the user from your workspace. This cannot be undone. Their time entries will be detached.',
      tone: 'danger',
      confirmLabel: 'Delete forever',
    });
    if (!ok) return;
    setBusy(true);
    setServerError(null);
    try {
      await deleteUser(member.id);
      navigate('/team');
    } catch (e) {
      setServerError(extractApiError(e, 'Could not delete user.'));
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <PageHero eyebrow="People" title="Edit team member" />
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
            Loading…
          </div>
        </main>
      </div>
    );
  }

  if (loadError || !member) {
    return (
      <div className="min-h-screen bg-bg">
        <PageHero eyebrow="People" title="Edit team member" />
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
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
      </div>
    );
  }

  const isArchived = !member.is_active && !member.is_pending_invite;

  return (
    <div className="min-h-screen bg-bg pb-16">
      {confirmDialog}
      <PageHero
        eyebrow="People"
        title={member.full_name || member.email}
        description={member.email}
      />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          to="/team"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Team
        </Link>

        {isArchived ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="inline-flex items-center gap-2 font-semibold">
              <Archive className="h-4 w-4" />
              This person is archived
            </span>
            <button
              type="button"
              onClick={handleRestore}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore
            </button>
          </div>
        ) : null}

        {successFlash ? (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-dark">
            <span>{successFlash}</span>
            <button
              type="button"
              onClick={() => setSuccessFlash(null)}
              className="text-xs font-semibold underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {serverError ? (
          <div className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {serverError}
          </div>
        ) : null}

        <form onSubmit={handleSave} noValidate className="space-y-6">
          {/* Profile */}
          <section className="card">
            <h2 className="font-heading text-lg font-bold text-text">Profile</h2>
            <p className="mt-1 text-sm text-muted">Personal details and capacity.</p>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="first_name" className="label">First name</label>
                  <input
                    id="first_name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="last_name" className="label">Last name</label>
                  <input
                    id="last_name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    className="input"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="label">Work email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="input"
                  required
                />
              </div>

              <div>
                <label htmlFor="employee_id" className="label">
                  Employee ID <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id="employee_id"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="input"
                  placeholder="e.g. EMP-1042"
                />
              </div>

              <div>
                <label className="label">
                  Roles <span className="font-normal text-muted">(optional)</span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setRolesOpen(!rolesOpen)}
                    className="inline-flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:border-slate-300"
                  >
                    <span className={selectedRoleNames.length === 0 ? 'text-muted' : 'text-text'}>
                      {selectedRoleNames.length === 0
                        ? 'Pick role labels — Designer, Senior, NYC…'
                        : selectedRoleNames.join(', ')}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted" />
                  </button>
                  {rolesOpen ? (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setRolesOpen(false)}
                        aria-hidden="true"
                      />
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {jobRoles.length === 0 ? (
                          <div className="px-3 py-3 text-sm text-muted">
                            No job roles yet. Create them in Manage → Roles.
                          </div>
                        ) : (
                          jobRoles.map((jr) => {
                            const checked = selectedJobRoleIds.includes(jr.id);
                            return (
                              <label
                                key={jr.id}
                                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition hover:bg-bg"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleJobRole(jr.id)}
                                  className="h-4 w-4 accent-primary"
                                />
                                {jr.name}
                              </label>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div>
                <label htmlFor="capacity" className="label">
                  Capacity <span className="font-normal text-muted">(hours per week)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="capacity"
                    type="number"
                    min={1}
                    max={168}
                    step={0.5}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="input w-32"
                  />
                  <span className="text-sm text-muted">hours per week</span>
                </div>
              </div>
            </div>
          </section>

          {/* Permissions */}
          <section className="card">
            <h2 className="font-heading text-lg font-bold text-text">Permissions</h2>
            <p className="mt-1 text-sm text-muted">
              {canEditPermission
                ? 'Choose what this person can see and do in TrackFlow.'
                : 'The workspace owner has full control and cannot be downgraded here.'}
            </p>

            {isOwnerTarget ? (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary-soft/40 px-4 py-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
                  <Briefcase className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold text-text">Owner</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {PERMISSION_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = permission === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                        selected
                          ? 'border-primary bg-primary-soft/40 ring-1 ring-primary/30'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="permission"
                        value={opt.value}
                        checked={selected}
                        onChange={() => setPermission(opt.value)}
                        className="mt-1 h-4 w-4 accent-primary"
                      />
                      <span
                        className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                          selected ? 'bg-primary text-white' : 'bg-slate-100 text-muted'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-bold text-text">{opt.label}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                          {opt.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Rates — admin/owner only */}
          {canEditRates ? (
            <section className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg font-bold text-text">Rates</h2>
                  <p className="mt-1 text-sm text-muted">
                    Used by the Profitability report to compute revenue and cost.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
                  <Lock className="h-3 w-3" />
                  Admin &amp; Owner only
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="hourly_rate" className="label">Default billable rate</label>
                  <div className="relative">
                    <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      id="hourly_rate"
                      type="number"
                      min={0}
                      step={0.01}
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      className="input pl-9"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    What clients are charged per hour for this person, by default.
                  </p>
                </div>

                <div>
                  <label htmlFor="cost_rate" className="label">Cost rate</label>
                  <div className="relative">
                    <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      id="cost_rate"
                      type="number"
                      min={0}
                      step={0.01}
                      value={costRate}
                      onChange={(e) => setCostRate(e.target.value)}
                      className="input pl-9"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    What you pay this person per hour. Drives the Cost column in reports.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {/* Project memberships */}
          <section className="card">
            <h2 className="font-heading text-lg font-bold text-text">Projects</h2>
            <p className="mt-1 text-sm text-muted">
              Projects this person can track time against. Manage assignments from the project&apos;s
              Team tab.
            </p>

            {member.project_memberships.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-muted">
                Not assigned to any projects yet.
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {member.project_memberships.map((pm) => (
                  <li
                    key={pm.project_id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/projects/${pm.project_id}`}
                        className="block truncate text-sm font-semibold text-text hover:text-primary"
                      >
                        {pm.project_name}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted">{pm.client_name}</p>
                    </div>
                    {pm.is_project_manager ? (
                      <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-dark">
                        Manager
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Save / Cancel */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={() => navigate('/team')} className="btn-outline">
              Cancel
            </button>
          </div>
        </form>

        {/* Danger zone */}
        {(canArchive || canDelete) ? (
          <section className="mt-8 rounded-2xl border border-danger/20 bg-white p-6 shadow-sm">
            <h2 className="font-heading text-base font-bold text-text">Danger zone</h2>
            <p className="mt-1 text-sm text-muted">
              Archiving keeps the user&apos;s history intact. Deleting permanently removes them.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {canArchive && !isArchived ? (
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
                >
                  <Archive className="h-4 w-4" />
                  Archive person
                </button>
              ) : null}
              {canArchive && isArchived ? (
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-4 py-2.5 text-sm font-semibold text-accent-dark transition hover:bg-accent/20 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore person
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-danger/90 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete forever
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
