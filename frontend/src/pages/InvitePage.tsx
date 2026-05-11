import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronDown,
  Clock,
  Mail,
  Search,
  Shield,
  User as UserIcon,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import {
  assignProjectsToInvite,
  createInvite,
  resendInvite,
  updateInvite,
} from '@/api/invites';
import { listJobRoles } from '@/api/jobRoles';
import { listProjects } from '@/api/projects';
import { extractApiError } from '@/utils/errors';
import { useDefaultCapacityHours } from '@/utils/preferences';
import type {
  InviteCreateResponse,
  InviteRole,
  JobRole,
  ProjectListItem,
} from '@/types';

type Step = 1 | 2 | 3 | 4;

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
    description: 'Good for people who just need to track time and submit timesheets.',
    icon: UserIcon,
  },
  {
    value: 'manager',
    label: 'Manager',
    description:
      'Good for people who need to approve and run reports for the projects and people they manage.',
    icon: UserCheck,
  },
  {
    value: 'admin',
    label: 'Administrator',
    description:
      'Good for people who need full control to manage projects, team, clients, and settings.',
    icon: Shield,
  },
];

const NAME_RE = /^[\p{L}][\p{L}\s'’\-]*$/u;

export default function InvitePage() {
  const navigate = useNavigate();
  const defaultCapacity = useDefaultCapacityHours();
  const [step, setStep] = useState<Step>(1);

  // step 1 state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [capacity, setCapacity] = useState(defaultCapacity);
  const [capacityTouched, setCapacityTouched] = useState(false);

  // Refresh default if the preference loads after the page renders
  useEffect(() => {
    if (!capacityTouched) setCapacity(defaultCapacity);
  }, [defaultCapacity, capacityTouched]);
  const [selectedJobRoleIds, setSelectedJobRoleIds] = useState<number[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [rolesOpen, setRolesOpen] = useState(false);

  // step 2 state
  const [permission, setPermission] = useState<InviteRole>('member');

  // step 3 state
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [assignedIds, setAssignedIds] = useState<Set<number>>(new Set());
  const [managerIds, setManagerIds] = useState<Set<number>>(new Set());

  // shared
  const [created, setCreated] = useState<InviteCreateResponse | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successFlash, setSuccessFlash] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  // load job roles once for step 1 multi-select
  useEffect(() => {
    listJobRoles()
      .then(setJobRoles)
      .catch(() => setJobRoles([]));
  }, []);

  // load projects when entering step 3
  useEffect(() => {
    if (step !== 3) return;
    listProjects({ is_active: true })
      .then((res) => setProjects(res.results))
      .catch((err) => setServerError(extractApiError(err, 'Failed to load projects')));
  }, [step]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.client_name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q),
    );
  }, [projectSearch, projects]);

  const allFilteredSelected =
    filteredProjects.length > 0 && filteredProjects.every((p) => assignedIds.has(p.id));

  const validateStep1 = (): string | null => {
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

  const handleStep1Submit = async () => {
    setServerError(null);
    const err = validateStep1();
    if (err) {
      setServerError(err);
      return;
    }
    setSubmitting(true);
    try {
      const result = await createInvite({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        employee_id: employeeId.trim() || undefined,
        weekly_capacity_hours: Number.parseFloat(capacity),
        job_role_ids: selectedJobRoleIds,
      });
      setCreated(result);
      setSuccessFlash(`We've emailed ${result.email} an invitation to join your team.`);
      setStep(2);
    } catch (e) {
      setServerError(extractApiError(e, 'Unable to send invite.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStep2Submit = async () => {
    if (!created) return;
    setServerError(null);
    setSubmitting(true);
    try {
      await updateInvite(created.id, { role: permission });
      setSuccessFlash(`${created.full_name}'s permissions were saved!`);
      setStep(3);
    } catch (e) {
      setServerError(extractApiError(e, 'Could not save permissions.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStep3Submit = async () => {
    if (!created) return;
    setServerError(null);
    setSubmitting(true);
    try {
      await assignProjectsToInvite(created.id, {
        project_ids: Array.from(assignedIds),
        manages_project_ids: Array.from(managerIds),
      });
      setSuccessFlash(`${created.full_name} is ready to go!`);
      setStep(4);
    } catch (e) {
      setServerError(extractApiError(e, 'Could not assign projects.'));
    } finally {
      setSubmitting(false);
    }
  };

  const skipStep3 = () => {
    setSuccessFlash(`${created?.full_name ?? 'This person'} is ready to go!`);
    setStep(4);
  };

  const handleResend = async () => {
    if (!created || resending) return;
    setResending(true);
    try {
      await resendInvite(created.id);
      setSuccessFlash('Invite email sent again.');
    } catch (e) {
      setServerError(extractApiError(e, 'Could not resend.'));
    } finally {
      setResending(false);
    }
  };

  const inviteAnother = () => {
    setStep(1);
    setFirstName('');
    setLastName('');
    setEmail('');
    setEmployeeId('');
    setCapacity(defaultCapacity);
    setCapacityTouched(false);
    setSelectedJobRoleIds([]);
    setPermission('member');
    setAssignedIds(new Set());
    setManagerIds(new Set());
    setCreated(null);
    setSuccessFlash(null);
    setServerError(null);
  };

  const toggleAssigned = (id: number) => {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setManagerIds((m) => {
          const nm = new Set(m);
          nm.delete(id);
          return nm;
        });
      } else next.add(id);
      return next;
    });
  };

  const toggleManager = (id: number) => {
    if (!assignedIds.has(id)) return;
    setManagerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredProjects.forEach((p) => {
          next.delete(p.id);
          setManagerIds((m) => {
            const nm = new Set(m);
            nm.delete(p.id);
            return nm;
          });
        });
      } else {
        filteredProjects.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const stepTitle = (() => {
    switch (step) {
      case 1:
        return 'Invite a person';
      case 2:
        return `What can ${created?.first_name || 'this person'} do in KlokView?`;
      case 3:
        return `What projects is ${created?.first_name || 'this person'} working on?`;
      case 4:
        return `${created?.full_name || 'This person'} is ready to go!`;
    }
  })();

  return (
    <div className="min-h-screen bg-bg pb-16">
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          to="/team"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Team
        </Link>

        <StepIndicator step={step} />

        {successFlash && step !== 1 ? (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-dark">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 flex-shrink-0" />
              <span>{successFlash}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessFlash(null)}
              className="text-xs font-semibold underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="card">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              {step === 1 ? (
                <UserPlus className="h-5 w-5" />
              ) : step === 2 ? (
                <Shield className="h-5 w-5" />
              ) : step === 3 ? (
                <Briefcase className="h-5 w-5" />
              ) : (
                <Check className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-2xl font-bold text-text">{stepTitle}</h1>
              {step === 1 ? (
                <p className="mt-1 text-sm text-muted">
                  We&apos;ll email this person an invitation to join your team in KlokView.
                </p>
              ) : null}
              {step === 2 ? (
                <p className="mt-1 text-sm text-muted">
                  Choose a permission based on what {created?.first_name || 'this person'} should be
                  able to see and do. You can always change this later.
                </p>
              ) : null}
              {step === 3 ? (
                <p className="mt-1 text-sm text-muted">
                  Add {created?.first_name || 'this person'} to projects so they can track time
                  against them.
                </p>
              ) : null}
            </div>
          </div>

          {serverError ? (
            <div className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {serverError}
            </div>
          ) : null}

          {step === 1 ? (
            <Step1Form
              firstName={firstName}
              setFirstName={setFirstName}
              lastName={lastName}
              setLastName={setLastName}
              email={email}
              setEmail={setEmail}
              employeeId={employeeId}
              setEmployeeId={setEmployeeId}
              capacity={capacity}
              setCapacity={(v) => {
                setCapacityTouched(true);
                setCapacity(v);
              }}
              jobRoles={jobRoles}
              selectedJobRoleIds={selectedJobRoleIds}
              setSelectedJobRoleIds={setSelectedJobRoleIds}
              rolesOpen={rolesOpen}
              setRolesOpen={setRolesOpen}
              onSubmit={handleStep1Submit}
              onCancel={() => navigate('/team')}
              submitting={submitting}
            />
          ) : null}

          {step === 2 ? (
            <Step2Permissions
              permission={permission}
              setPermission={setPermission}
              onSubmit={handleStep2Submit}
              onSkip={() => setStep(3)}
              submitting={submitting}
            />
          ) : null}

          {step === 3 ? (
            <Step3AssignProjects
              projects={filteredProjects}
              search={projectSearch}
              setSearch={setProjectSearch}
              assignedIds={assignedIds}
              managerIds={managerIds}
              toggleAssigned={toggleAssigned}
              toggleManager={toggleManager}
              toggleAllFiltered={toggleAllFiltered}
              allFilteredSelected={allFilteredSelected}
              onSubmit={handleStep3Submit}
              onSkip={skipStep3}
              submitting={submitting}
            />
          ) : null}

          {step === 4 && created ? (
            <Step4Done
              user={created}
              assignedCount={assignedIds.size}
              managerCount={managerIds.size}
              onResend={handleResend}
              resending={resending}
              onInviteAnother={inviteAnother}
              onDone={() => navigate('/team')}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

// ---------- Step indicator ----------

function StepIndicator({ step }: { step: Step }) {
  const labels = ['Basic info', 'Permissions', 'Projects', 'Done'];
  return (
    <ol className="mb-6 flex items-center gap-2">
      {labels.map((label, i) => {
        const idx = (i + 1) as Step;
        const done = idx < step;
        const active = idx === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                done
                  ? 'bg-accent text-text'
                  : active
                    ? 'bg-primary text-white'
                    : 'bg-slate-200 text-muted'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : idx}
            </span>
            <span
              className={`text-xs font-semibold transition ${
                active ? 'inline text-text' : `hidden sm:inline ${done ? 'text-muted' : 'text-muted/60'}`
              }`}
            >
              {label}
            </span>
            {i < labels.length - 1 ? (
              <span
                className={`ml-1 h-px flex-1 transition ${
                  done ? 'bg-accent' : 'bg-slate-200'
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Step 1 ----------

interface Step1Props {
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  employeeId: string;
  setEmployeeId: (v: string) => void;
  capacity: string;
  setCapacity: (v: string) => void;
  jobRoles: JobRole[];
  selectedJobRoleIds: number[];
  setSelectedJobRoleIds: (ids: number[]) => void;
  rolesOpen: boolean;
  setRolesOpen: (v: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}

function Step1Form({
  firstName, setFirstName, lastName, setLastName, email, setEmail,
  employeeId, setEmployeeId, capacity, setCapacity,
  jobRoles, selectedJobRoleIds, setSelectedJobRoleIds, rolesOpen, setRolesOpen,
  onSubmit, onCancel, submitting,
}: Step1Props) {
  const selectedNames = jobRoles
    .filter((jr) => selectedJobRoleIds.includes(jr.id))
    .map((jr) => jr.name);

  const toggleJobRole = (id: number) => {
    if (selectedJobRoleIds.includes(id)) {
      setSelectedJobRoleIds(selectedJobRoleIds.filter((x) => x !== id));
    } else {
      setSelectedJobRoleIds([...selectedJobRoleIds, id]);
    }
  };

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
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
        <p className="mt-1 text-xs text-muted">
          A unique identifier for this employee within your organization.
        </p>
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
            <span className={selectedNames.length === 0 ? 'text-muted' : 'text-text'}>
              {selectedNames.length === 0
                ? 'Pick role labels — Designer, Senior, NYC…'
                : selectedNames.join(', ')}
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
        <p className="mt-1 text-xs text-muted">
          Roles describe how you&apos;d describe this person — like Designer, Senior, NYC. Helps
          organize Team and reports.
        </p>
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
        <p className="mt-1 text-xs text-muted">
          Used by utilization reports. Default is 35 if your team is full-time at this rate.
        </p>
      </div>

      <div className="-mx-6 -mb-6 mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Sending invite…' : 'Invite and continue'}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------- Step 2 ----------

function Step2Permissions({
  permission, setPermission, onSubmit, onSkip, submitting,
}: {
  permission: InviteRole;
  setPermission: (v: InviteRole) => void;
  onSubmit: () => void;
  onSkip: () => void;
  submitting: boolean;
}) {
  return (
    <div className="mt-5 space-y-3">
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

      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={onSubmit} disabled={submitting} className="btn-primary">
          {submitting ? 'Saving…' : 'Save permissions and continue'}
        </button>
        <button type="button" onClick={onSkip} className="btn-outline">
          Skip
        </button>
      </div>
    </div>
  );
}

// ---------- Step 3 ----------

interface Step3Props {
  projects: ProjectListItem[];
  search: string;
  setSearch: (v: string) => void;
  assignedIds: Set<number>;
  managerIds: Set<number>;
  toggleAssigned: (id: number) => void;
  toggleManager: (id: number) => void;
  toggleAllFiltered: () => void;
  allFilteredSelected: boolean;
  onSubmit: () => void;
  onSkip: () => void;
  submitting: boolean;
}

function Step3AssignProjects({
  projects, search, setSearch, assignedIds, managerIds,
  toggleAssigned, toggleManager, toggleAllFiltered, allFilteredSelected,
  onSubmit, onSkip, submitting,
}: Step3Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, ProjectListItem[]>();
    for (const p of projects) {
      const key = p.client_name;
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [projects]);

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find and select projects to assign…"
              className="input w-full pl-9"
            />
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted">
            No active projects yet. You can assign projects later from the Team page.
          </div>
        ) : (
          <>
            <div className="border-b border-slate-200 px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                  className="h-4 w-4 accent-primary"
                />
                Select all
                <span className="font-normal text-muted">({projects.length})</span>
              </label>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {grouped.map(([clientName, items]) => (
                <div key={clientName} className="border-b border-slate-100 last:border-b-0">
                  <p className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    {clientName}
                  </p>
                  {items.map((p) => {
                    const assigned = assignedIds.has(p.id);
                    const manages = managerIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-bg"
                      >
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={assigned}
                            onChange={() => toggleAssigned(p.id)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm font-medium text-text">{p.name}</span>
                        </label>
                        <label
                          className={`flex items-center gap-1.5 text-xs ${
                            assigned ? 'cursor-pointer text-text' : 'cursor-not-allowed text-muted/50'
                          }`}
                          title={
                            assigned
                              ? 'Toggle whether this person manages the project'
                              : 'Assign first to mark as manager'
                          }
                        >
                          <input
                            type="checkbox"
                            checked={manages}
                            disabled={!assigned}
                            onChange={() => toggleManager(p.id)}
                            className="h-3.5 w-3.5 accent-accent"
                          />
                          Manages this project
                        </label>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {assignedIds.size > 0 ? (
        <div className="rounded-lg bg-bg/60 px-4 py-2.5 text-xs text-muted">
          <strong className="font-semibold text-text">{assignedIds.size}</strong>{' '}
          {assignedIds.size === 1 ? 'project' : 'projects'} selected
          {managerIds.size > 0 ? (
            <> — manages <strong className="font-semibold text-accent-dark">{managerIds.size}</strong></>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={onSubmit} disabled={submitting} className="btn-primary">
          {submitting ? 'Assigning…' : 'Assign projects'}
        </button>
        <button type="button" onClick={onSkip} className="btn-outline">
          Skip
        </button>
      </div>
    </div>
  );
}

// ---------- Step 4 (done) ----------

function Step4Done({
  user, assignedCount, managerCount, onResend, resending, onInviteAnother, onDone,
}: {
  user: InviteCreateResponse;
  assignedCount: number;
  managerCount: number;
  onResend: () => void;
  resending: boolean;
  onInviteAnother: () => void;
  onDone: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent-soft/60 p-4">
        <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-text">
          <Mail className="h-5 w-5" />
        </span>
        <div>
          <p className="font-semibold text-text">{user.full_name}</p>
          <p className="mt-0.5 text-sm text-muted">{user.email}</p>
          <p className="mt-2 text-xs text-muted">
            Invitation sent. The link expires in 7 days. Ask {user.first_name || 'them'} to check
            their inbox — and the spam folder, just in case.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Permission" value={user.role.charAt(0).toUpperCase() + user.role.slice(1)} icon={Shield} />
        <Stat label="Assigned to" value={`${assignedCount} ${assignedCount === 1 ? 'project' : 'projects'}`} icon={Briefcase} />
        <Stat label="Manages" value={`${managerCount} ${managerCount === 1 ? 'project' : 'projects'}`} icon={UsersIcon} />
      </div>

      <Stat label="Capacity" value={`${user.weekly_capacity_hours} hr / week`} icon={Clock} />

      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={onDone} className="btn-primary">
          Done
        </button>
        <button type="button" onClick={onInviteAnother} className="btn-outline">
          Invite another
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={resending}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-text transition hover:bg-slate-50 disabled:opacity-50"
        >
          {resending ? 'Resending…' : 'Resend email'}
        </button>
      </div>
    </div>
  );
}

function Stat({
  label, value, icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        <p className="truncate text-sm font-semibold text-text">{value}</p>
      </div>
    </div>
  );
}
