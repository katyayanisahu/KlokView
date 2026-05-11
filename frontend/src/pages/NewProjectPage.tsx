import {
  ArrowLeft,
  Ban,
  Briefcase,
  CheckCircle2,
  Circle,
  Clock,
  DollarSign,
  FileText,
  ListChecks,
  Plus,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import NewClientModal from '@/components/NewClientModal';
import { listClients } from '@/api/clients';
import { createProject, createTask, listTasks } from '@/api/projects';
import { listTeam } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import { useCurrencySymbol } from '@/utils/format';
import type {
  BillableRateStrategy,
  BudgetType,
  Client,
  ProjectType,
  ProjectVisibility,
  Task,
  TeamMember,
} from '@/types';

const PROJECT_TYPE_OPTIONS: Array<{
  value: ProjectType;
  label: string;
  description: string;
}> = [
  {
    value: 'time_materials',
    label: 'Time & Materials',
    description: 'Bill by the hour, with billable rates.',
  },
  {
    value: 'fixed_fee',
    label: 'Fixed Fee',
    description: 'Bill a set price, regardless of time tracked.',
  },
  {
    value: 'non_billable',
    label: 'Non-Billable',
    description: 'Not billed to a client.',
  },
];

const BILLABLE_STRATEGY_OPTIONS: Array<{
  value: BillableRateStrategy;
  label: string;
  description: string;
}> = [
  {
    value: 'person',
    label: 'Person billable rate',
    description: 'Each member uses their own default billable rate.',
  },
  {
    value: 'task',
    label: 'Task billable rate',
    description: 'Each task has its own billable rate.',
  },
  {
    value: 'project',
    label: 'Project billable rate',
    description: 'A single rate applied to all hours on this project.',
  },
];

const BUDGET_OPTIONS: Array<{ value: BudgetType; label: string }> = [
  { value: 'none', label: 'No budget' },
  { value: 'total_hours', label: 'Total project hours' },
  { value: 'hours_per_task', label: 'Hours per task' },
];

const STEPS = [
  { id: 'basics', label: 'Basics', icon: FileText },
  { id: 'rates', label: 'Type & Rates', icon: Briefcase },
  { id: 'budget', label: 'Budget', icon: Clock },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'team', label: 'Team', icon: Users },
] as const;

export default function NewProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectClientId = searchParams.get('client');
  const currentUser = useAuthStore((s) => s.user);
  const currencySymbol = useCurrencySymbol();

  const [clientId, setClientId] = useState<number | ''>(
    preselectClientId ? Number.parseInt(preselectClientId, 10) : '',
  );
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState<ProjectVisibility>('admins_and_managers');
  const [budgetType, setBudgetType] = useState<BudgetType>('none');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetResetsMonthly, setBudgetResetsMonthly] = useState(false);
  const [budgetAlertPercent, setBudgetAlertPercent] = useState<string>('');

  const [projectType, setProjectType] = useState<ProjectType>('time_materials');
  const [billableRateStrategy, setBillableRateStrategy] =
    useState<BillableRateStrategy>('person');
  const [flatBillableRate, setFlatBillableRate] = useState('');

  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [billableTaskIds, setBillableTaskIds] = useState<Set<number>>(new Set());
  const [taskRates, setTaskRates] = useState<Map<number, string>>(new Map());
  const [newTaskName, setNewTaskName] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskCreateError, setTaskCreateError] = useState<string | null>(null);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<
    Array<{ user_id: number; hourly_rate: string; is_project_manager: boolean }>
  >([]);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    listClients({ is_active: true }).then((r) => setClients(r.results));
    listTasks({ is_active: true }).then((r) => {
      setTasks(r.results);
      const defaults = r.results.filter((t) => t.is_default);
      setSelectedTaskIds(new Set(defaults.map((t) => t.id)));
      setBillableTaskIds(new Set(defaults.filter((t) => t.default_is_billable).map((t) => t.id)));
    });
    listTeam()
      .then((team) => {
        setTeamMembers(team);
        if (currentUser) {
          setSelectedMembers((prev) => {
            if (prev.some((m) => m.user_id === currentUser.id)) return prev;
            return [
              { user_id: currentUser.id, hourly_rate: '', is_project_manager: true },
              ...prev,
            ];
          });
        }
      })
      .catch(() => setTeamMembers([]));
  }, [currentUser]);

  const availableBudgetOptions = BUDGET_OPTIONS;

  const toggleTask = (taskId: number) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleTaskBillable = (taskId: number) => {
    setBillableTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const selectAllBillable = (billable: boolean) => {
    if (billable) setBillableTaskIds(new Set(selectedTaskIds));
    else setBillableTaskIds(new Set());
  };

  const handleCreateInlineTask = async () => {
    const trimmed = newTaskName.trim();
    if (!trimmed) return;
    setCreatingTask(true);
    setTaskCreateError(null);
    try {
      const created = await createTask({
        name: trimmed,
        is_default: false,
        default_is_billable: true,
        default_billable_rate: null,
      });
      setTasks((prev) => [...prev, created]);
      setSelectedTaskIds((prev) => new Set(prev).add(created.id));
      setBillableTaskIds((prev) => new Set(prev).add(created.id));
      setNewTaskName('');
    } catch (err) {
      setTaskCreateError(extractApiError(err, 'Could not create task.'));
    } finally {
      setCreatingTask(false);
    }
  };

  const addMember = (userId: number) => {
    if (selectedMembers.some((m) => m.user_id === userId)) return;
    setSelectedMembers((prev) => [
      ...prev,
      { user_id: userId, hourly_rate: '', is_project_manager: false },
    ]);
    setMemberPickerOpen(false);
    setMemberSearch('');
  };

  const removeMember = (userId: number) => {
    setSelectedMembers((prev) => prev.filter((m) => m.user_id !== userId));
  };

  const updateMemberRate = (userId: number, rate: string) => {
    setSelectedMembers((prev) =>
      prev.map((m) => (m.user_id === userId ? { ...m, hourly_rate: rate } : m)),
    );
  };

  const toggleMemberManager = (userId: number) => {
    setSelectedMembers((prev) =>
      prev.map((m) =>
        m.user_id === userId ? { ...m, is_project_manager: !m.is_project_manager } : m,
      ),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      setFieldErrors({ client_id: 'Select a client or create one.' });
      return;
    }
    if (!name.trim()) {
      setFieldErrors({ name: 'Project name is required.' });
      return;
    }
    setFieldErrors({});
    setServerError(null);
    setSubmitting(true);
    try {
      const effectiveStrategy: BillableRateStrategy =
        projectType === 'non_billable' ? 'none' : billableRateStrategy;
      const project = await createProject({
        client_id: clientId,
        name: name.trim(),
        code: code.trim() || undefined,
        start_date: startDate || null,
        end_date: endDate || null,
        notes: notes.trim() || undefined,
        visibility,
        project_type: projectType,
        budget_type: budgetType,
        budget_amount: budgetType === 'none' ? null : budgetAmount || null,
        budget_resets_monthly: budgetResetsMonthly,
        budget_alert_percent: budgetAlertPercent ? Number.parseInt(budgetAlertPercent, 10) : null,
        billable_rate_strategy: effectiveStrategy,
        flat_billable_rate:
          effectiveStrategy === 'project' && flatBillableRate.trim() !== ''
            ? flatBillableRate
            : null,
        task_ids: Array.from(selectedTaskIds),
        task_rates:
          billableRateStrategy === 'task'
            ? Object.fromEntries(
                Array.from(selectedTaskIds)
                  .filter((id) => billableTaskIds.has(id))
                  .map((id) => [String(id), (taskRates.get(id) ?? '').trim() || null]),
              )
            : undefined,
        members:
          selectedMembers.length > 0
            ? selectedMembers.map((m) => ({
                user_id: m.user_id,
                hourly_rate:
                  effectiveStrategy === 'person' && m.hourly_rate.trim() !== ''
                    ? m.hourly_rate
                    : null,
                is_project_manager: m.is_project_manager,
              }))
            : undefined,
      });
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setServerError(extractApiError(err, 'Could not create project.'));
      setSubmitting(false);
    }
  };

  const budgetNeedsAmount = budgetType !== 'none';
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => a.name.localeCompare(b.name)), [tasks]);

  // Step completion tracking — drives the left-rail checkmarks and progress bar
  const stepDone = {
    basics: Boolean(clientId) && name.trim().length > 0,
    rates:
      projectType === 'non_billable' ||
      billableRateStrategy === 'person' ||
      billableRateStrategy === 'task' ||
      (billableRateStrategy === 'project' && flatBillableRate.trim().length > 0),
    budget: budgetType === 'none' || (budgetNeedsAmount && budgetAmount.trim().length > 0),
    tasks: selectedTaskIds.size > 0,
    team: selectedMembers.length > 0,
  };
  const completedSteps = Object.values(stepDone).filter(Boolean).length;
  const progressPct = Math.round((completedSteps / STEPS.length) * 100);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const billableCount = Array.from(selectedTaskIds).filter((id) => billableTaskIds.has(id)).length;

  const formatBudgetSummary = () => {
    if (budgetType === 'none') return 'No budget';
    if (!budgetAmount) return availableBudgetOptions.find((o) => o.value === budgetType)?.label;
    return `${Number.parseFloat(budgetAmount || '0').toLocaleString()} hr`;
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg pb-24">
      {/* Page header — full-width strip with subtle gradient */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-primary-soft/40 via-white to-white">
        <div className="mx-auto max-w-6xl px-5 py-4 sm:px-6 sm:py-5 lg:px-8">
          <Link
            to="/projects"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted transition hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-heading text-2xl font-bold text-text sm:text-3xl">
                New project
              </h1>
              <p className="mt-1 text-sm text-muted">
                {selectedClient ? `for ${selectedClient.name}` : 'Choose a client to get started'}
              </p>
            </div>
            <div className="min-w-[220px]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-text">{completedSteps} of {STEPS.length} steps</span>
                <span className="text-muted">{progressPct}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-5 py-4 sm:px-6 sm:py-6 lg:px-8">
        <form onSubmit={handleSubmit} className="grid min-w-0 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Left rail — sticky step nav + live summary */}
          <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <nav className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              {STEPS.map((step) => {
                const done = stepDone[step.id as keyof typeof stepDone];
                const Icon = step.icon;
                return (
                  <a
                    key={step.id}
                    href={`#${step.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-bg"
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-accent-dark" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                    )}
                    <Icon className="h-4 w-4 shrink-0 text-muted" />
                    <span className={`font-medium ${done ? 'text-text' : 'text-muted'}`}>
                      {step.label}
                    </span>
                  </a>
                );
              })}
            </nav>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-primary/15 bg-primary-soft/60 px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Live summary
                </p>
              </div>
              <dl className="divide-y divide-slate-100 px-4 text-sm">
                <div className="grid grid-cols-[70px_1fr] items-baseline gap-x-3 py-2.5">
                  <dt className="text-xs font-medium text-muted">Client</dt>
                  <dd className="min-w-0 truncate font-semibold text-text">
                    {selectedClient?.name ?? <span className="font-normal text-muted">— not chosen —</span>}
                  </dd>
                </div>
                <div className="grid grid-cols-[70px_1fr] items-baseline gap-x-3 py-2.5">
                  <dt className="text-xs font-medium text-muted">Budget</dt>
                  <dd className="min-w-0 font-semibold text-text">{formatBudgetSummary()}</dd>
                </div>
                <div className="grid grid-cols-[70px_1fr] items-baseline gap-x-3 py-2.5">
                  <dt className="text-xs font-medium text-muted">Tasks</dt>
                  <dd className="min-w-0 font-semibold text-text">
                    {selectedTaskIds.size} selected
                    {billableCount > 0 ? (
                      <span className="ml-1 text-xs font-normal text-muted">
                        ({billableCount} billable)
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div className="grid grid-cols-[70px_1fr] items-baseline gap-x-3 py-2.5">
                  <dt className="text-xs font-medium text-muted">Team</dt>
                  <dd className="min-w-0 font-semibold text-text">
                    {selectedMembers.length > 0
                      ? `${selectedMembers.length} assigned`
                      : <span className="font-normal text-muted">— none yet —</span>}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>

          {/* Right pane — content sections */}
          <div className="min-w-0 space-y-4">
            {/* Basics */}
            <section
              id="basics"
              className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-text">Basics</h2>
                  <p className="text-xs text-muted">Who's the work for, and what's it called?</p>
                </div>
              </header>
              <div className="space-y-4 px-5 py-4">
                <div>
                  <label className="label">Client</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={clientId}
                      onChange={(e) =>
                        setClientId(e.target.value ? Number.parseInt(e.target.value, 10) : '')
                      }
                      className="input flex-1 min-w-[200px]"
                    >
                      <option value="">Choose a client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setClientModalOpen(true)}
                      className="btn-outline whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4" />
                      New client
                    </button>
                  </div>
                  {fieldErrors.client_id ? (
                    <p className="mt-1 text-xs text-danger">{fieldErrors.client_id}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                  <div>
                    <label htmlFor="name" className="label">
                      Project name
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                      placeholder="e.g. Q2 Marketing Campaign"
                      required
                    />
                    {fieldErrors.name ? (
                      <p className="mt-1 text-xs text-danger">{fieldErrors.name}</p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="code" className="label">
                      Code
                    </label>
                    <input
                      id="code"
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="input"
                      placeholder="MKT-Q2"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">Starts on</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Ends on</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="notes" className="label">
                    Notes <span className="font-normal text-muted">(visible to admins only)</span>
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input resize-none"
                    placeholder="Anything internal worth remembering…"
                  />
                </div>

                <div>
                  <label className="label">Who can see the project report?</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition ${
                        visibility === 'admins_and_managers'
                          ? 'border-primary bg-primary-soft/40'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        checked={visibility === 'admins_and_managers'}
                        onChange={() => setVisibility('admins_and_managers')}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span>
                        <span className="block font-medium text-text">Admins & managers only</span>
                        <span className="block text-xs text-muted">
                          People who manage this project
                        </span>
                      </span>
                    </label>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition ${
                        visibility === 'everyone'
                          ? 'border-primary bg-primary-soft/40'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        checked={visibility === 'everyone'}
                        onChange={() => setVisibility('everyone')}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span>
                        <span className="block font-medium text-text">Everyone on project</span>
                        <span className="block text-xs text-muted">
                          All assigned team members
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* Project type & Billable rates */}
            <section
              id="rates"
              className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Briefcase className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-text">Type &amp; Rates</h2>
                  <p className="text-xs text-muted">
                    How this project is billed. Drives the Profitability report.
                  </p>
                </div>
              </header>
              <div className="space-y-4 px-5 py-4">
                <div>
                  <label className="label">Project type</label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {PROJECT_TYPE_OPTIONS.map((opt) => {
                      const selected = projectType === opt.value;
                      const TypeIcon =
                        opt.value === 'time_materials'
                          ? Clock
                          : opt.value === 'fixed_fee'
                          ? Tag
                          : Ban;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setProjectType(opt.value)}
                          aria-pressed={selected}
                          className={`group relative flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                            selected
                              ? 'border-primary bg-primary-soft/40 shadow-sm ring-1 ring-primary/20'
                              : 'border-slate-200 bg-white hover:border-primary/40 hover:bg-primary-soft/20'
                          }`}
                        >
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                              selected
                                ? 'bg-primary text-white'
                                : 'bg-primary-soft/60 text-primary'
                            }`}
                          >
                            <TypeIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1 pr-5">
                            <span className="block font-semibold text-text">{opt.label}</span>
                            <span className="block text-xs leading-snug text-muted">
                              {opt.description}
                            </span>
                          </span>
                          {selected ? (
                            <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-primary" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {projectType !== 'non_billable' ? (
                  <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-4">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary ring-1 ring-primary/20">
                        <DollarSign className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="font-semibold text-text">Billable rates</h3>
                        <p className="text-xs text-muted">
                          We need billable rates to track this project&apos;s billable amount.
                        </p>
                      </div>
                    </div>

                    {/* Segmented pill control — replaces dropdown for a more branded feel */}
                    <div className="mt-4 inline-flex w-full max-w-full flex-wrap gap-1 rounded-lg border border-primary/15 bg-white p-1 sm:w-auto sm:flex-nowrap">
                      {BILLABLE_STRATEGY_OPTIONS.map((opt) => {
                        const selected = billableRateStrategy === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setBillableRateStrategy(opt.value)}
                            aria-pressed={selected}
                            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
                              selected
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-muted hover:text-text'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {BILLABLE_STRATEGY_OPTIONS.find((o) => o.value === billableRateStrategy)
                        ?.description}
                    </p>

                    {/* Strategy-specific inputs */}
                    {billableRateStrategy === 'project' ? (
                      <div className="mt-4 rounded-lg border border-primary/15 bg-white p-3">
                        <label htmlFor="flat_billable_rate" className="label">
                          Project rate
                        </label>
                        <div className="relative w-full max-w-[220px]">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
                            {currencySymbol}
                          </span>
                          <input
                            id="flat_billable_rate"
                            type="number"
                            min={0}
                            step={0.01}
                            value={flatBillableRate}
                            onChange={(e) => setFlatBillableRate(e.target.value)}
                            className="input pl-8"
                            placeholder="0.00"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
                            / hr
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          Charged per hour, regardless of who tracked it.
                        </p>
                      </div>
                    ) : billableRateStrategy === 'person' ? (
                      <div className="mt-4 rounded-lg border border-primary/15 bg-white p-3">
                        <p className="text-xs font-semibold text-text">
                          Each member uses their own billable rate
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Set each member&apos;s rate in the{' '}
                          <a
                            href="#team"
                            className="font-medium text-primary hover:underline"
                          >
                            Team section below ↓
                          </a>
                          . Members without a rate will track time as non-billable.
                        </p>
                      </div>
                    ) : billableRateStrategy === 'task' ? (
                      <div className="mt-4 rounded-lg border border-primary/15 bg-white p-3">
                        <p className="text-xs font-semibold text-text">
                          Each task has its own billable rate
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Set each task&apos;s rate in the{' '}
                          <a
                            href="#tasks"
                            className="font-medium text-primary hover:underline"
                          >
                            Tasks section below ↓
                          </a>
                          . Tasks without a rate will track time as non-billable.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            {/* Budget */}
            <section
              id="budget"
              className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Clock className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-text">Budget (hours)</h2>
                  <p className="text-xs text-muted">Cap project hours and get alerts before going over.</p>
                </div>
              </header>
              <div className="space-y-4 px-5 py-4">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <label htmlFor="budget_type" className="label">
                      Budget type
                    </label>
                    <select
                      id="budget_type"
                      value={budgetType}
                      onChange={(e) => setBudgetType(e.target.value as BudgetType)}
                      className="input w-full"
                    >
                      {availableBudgetOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {budgetNeedsAmount ? (
                    <div>
                      <label htmlFor="budget_amount" className="label">
                        Budgeted hours
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="budget_amount"
                          type="number"
                          min="0"
                          step="0.5"
                          value={budgetAmount}
                          onChange={(e) => setBudgetAmount(e.target.value)}
                          className="input w-full"
                          placeholder="0.00"
                        />
                        <span className="whitespace-nowrap text-sm font-medium text-muted">
                          hours
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>

                {budgetNeedsAmount ? (
                  <div className="space-y-2 rounded-xl border border-primary/15 bg-primary-soft/20 p-3">
                    <label className="flex items-center gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={budgetResetsMonthly}
                        onChange={(e) => setBudgetResetsMonthly(e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      Budget resets every month
                    </label>
                    <label className="flex flex-wrap items-center gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={!!budgetAlertPercent}
                        onChange={(e) => setBudgetAlertPercent(e.target.checked ? '80' : '')}
                        className="h-4 w-4 accent-primary"
                      />
                      Email me when project exceeds
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={budgetAlertPercent}
                        onChange={(e) => setBudgetAlertPercent(e.target.value)}
                        disabled={!budgetAlertPercent}
                        className="input w-20"
                      />
                      <span>% of budget</span>
                    </label>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Tasks */}
            <section
              id="tasks"
              className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <ListChecks className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-heading text-lg font-bold text-text">Tasks</h2>
                    <p className="text-xs text-muted">
                      {selectedTaskIds.size} of {sortedTasks.length} selected
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted">
                  Mark billable —{' '}
                  <button
                    type="button"
                    onClick={() => selectAllBillable(true)}
                    className="font-medium text-primary hover:underline"
                  >
                    All
                  </button>{' '}
                  /{' '}
                  <button
                    type="button"
                    onClick={() => selectAllBillable(false)}
                    className="font-medium text-primary hover:underline"
                  >
                    None
                  </button>
                </div>
              </header>
              <div className="divide-y divide-slate-100">
                <div
                  className={`grid gap-3 bg-slate-50/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted sm:gap-4 sm:px-5 ${
                    billableRateStrategy === 'task'
                      ? 'grid-cols-[1fr_80px_120px]'
                      : 'grid-cols-[1fr_80px]'
                  }`}
                >
                  <div>Task</div>
                  <div className="text-center">Billable</div>
                  {billableRateStrategy === 'task' ? (
                    <div className="text-right">Rate (per hr)</div>
                  ) : null}
                </div>
                {sortedTasks.map((task) => {
                  const isSelected = selectedTaskIds.has(task.id);
                  const isBillable = billableTaskIds.has(task.id);
                  const showRate = billableRateStrategy === 'task';
                  const rateValue = taskRates.get(task.id) ?? '';
                  const ratePlaceholder = task.default_billable_rate ?? '0.00';
                  return (
                    <label
                      key={task.id}
                      className={`grid cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-slate-50/50 sm:gap-4 sm:px-5 ${
                        showRate ? 'grid-cols-[1fr_80px_120px]' : 'grid-cols-[1fr_80px]'
                      } ${isSelected ? '' : 'opacity-60'}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTask(task.id)}
                          className="h-4 w-4 flex-shrink-0 accent-primary"
                        />
                        <span className="truncate font-medium text-text">{task.name}</span>
                        {task.is_default ? (
                          <span className="flex-shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={isBillable}
                          disabled={!isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleTaskBillable(task.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 accent-primary disabled:opacity-40"
                        />
                      </div>
                      {showRate ? (
                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <div className="relative w-full max-w-[110px]">
                            <span
                              className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted ${
                                !isSelected || !isBillable ? 'opacity-40' : ''
                              }`}
                            >
                              {currencySymbol}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={rateValue}
                              disabled={!isSelected || !isBillable}
                              onChange={(e) => {
                                const next = new Map(taskRates);
                                if (e.target.value === '') {
                                  next.delete(task.id);
                                } else {
                                  next.set(task.id, e.target.value);
                                }
                                setTaskRates(next);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              placeholder={ratePlaceholder}
                              className="input w-full py-1.5 pl-7 text-right text-sm disabled:opacity-40"
                            />
                          </div>
                        </div>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              <div className="border-t border-slate-100 bg-slate-50/30 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newTaskName}
                    onChange={(e) => {
                      setNewTaskName(e.target.value);
                      if (taskCreateError) setTaskCreateError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateInlineTask();
                      }
                    }}
                    placeholder="Add a task…"
                    className="input flex-1 min-w-[200px] py-2 text-sm"
                    disabled={creatingTask}
                  />
                  <button
                    type="button"
                    onClick={handleCreateInlineTask}
                    disabled={creatingTask || !newTaskName.trim()}
                    className="btn-outline whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {creatingTask ? 'Adding…' : 'Add task'}
                  </button>
                </div>
                {taskCreateError ? (
                  <p className="mt-2 text-xs text-danger">{taskCreateError}</p>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    Creates a new workspace task and adds it to this project. Manage all tasks under{' '}
                    <Link to="/manage/tasks" className="font-medium text-primary hover:underline">
                      Manage → Tasks
                    </Link>
                    .
                  </p>
                )}
              </div>
            </section>

            {/* Team */}
            <section
              id="team"
              className="scroll-mt-20 rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-4 py-3 sm:px-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-text">Team</h2>
                  <p className="text-xs text-muted">
                    {selectedMembers.length > 0
                      ? `${selectedMembers.length} ${selectedMembers.length === 1 ? 'person' : 'people'} assigned`
                      : 'Add the people who will track time on this project'}
                  </p>
                </div>
              </header>

              {selectedMembers.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  <div
                    className={`grid gap-3 bg-slate-50/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted sm:gap-4 sm:px-5 ${
                      billableRateStrategy === 'person' && projectType !== 'non_billable'
                        ? 'grid-cols-[1fr_140px_120px_28px]'
                        : 'grid-cols-[1fr_120px_28px]'
                    }`}
                  >
                    <div>Person</div>
                    {billableRateStrategy === 'person' && projectType !== 'non_billable' ? (
                      <div className="text-right">Billable rate</div>
                    ) : null}
                    <div className="text-center">Manages</div>
                    <div />
                  </div>
                  {selectedMembers.map((m) => {
                    const tm = teamMembers.find((t) => t.id === m.user_id);
                    const fallbackName =
                      currentUser && currentUser.id === m.user_id
                        ? currentUser.full_name || currentUser.email
                        : '';
                    const displayName = tm?.full_name || tm?.email || fallbackName || `User #${m.user_id}`;
                    const displayRole = tm?.role || (currentUser?.id === m.user_id ? currentUser.role : '');
                    const avatarUrl = tm?.avatar_url || (currentUser?.id === m.user_id ? currentUser.avatar_url : '');
                    const initials = displayName
                      .split(' ')
                      .map((p) => p[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();
                    const showRate =
                      billableRateStrategy === 'person' && projectType !== 'non_billable';
                    return (
                      <div
                        key={m.user_id}
                        className={`grid items-center gap-3 px-4 py-2.5 text-sm sm:gap-4 sm:px-5 ${
                          showRate
                            ? 'grid-cols-[1fr_140px_120px_28px]'
                            : 'grid-cols-[1fr_120px_28px]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt=""
                              className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                              {initials}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-text">{displayName}</p>
                            {displayRole ? (
                              <p className="truncate text-xs capitalize text-muted">{displayRole}</p>
                            ) : null}
                          </div>
                        </div>
                        {showRate ? (
                          <div className="flex justify-end">
                            <div className="relative w-full max-w-[130px]">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
                                {currencySymbol}
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={m.hourly_rate}
                                onChange={(e) => updateMemberRate(m.user_id, e.target.value)}
                                placeholder="Missing rate"
                                className="input w-full py-1.5 pl-7 text-right text-sm tabular-nums"
                              />
                            </div>
                          </div>
                        ) : null}
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={m.is_project_manager}
                            onChange={() => toggleMemberManager(m.user_id)}
                            className="h-4 w-4 accent-primary"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember(m.user_id)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                          aria-label={`Remove ${tm?.full_name || 'member'}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-5 text-center text-sm text-muted sm:px-5">
                  No one assigned yet. Add a person below — they'll be able to track time on this project.
                </div>
              )}

              <div className="border-t border-slate-100 bg-slate-50/30 px-4 py-3 sm:px-5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMemberPickerOpen((v) => !v)}
                    className="btn-outline w-full justify-center sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Assign a person
                  </button>
                  {memberPickerOpen ? (
                    <div className="absolute left-0 z-10 mt-2 w-full max-w-[320px] rounded-lg border border-slate-200 bg-white shadow-lg">
                      <div className="border-b border-slate-100 p-2">
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder="Search team…"
                          className="input w-full py-1.5 text-sm"
                          autoFocus
                        />
                      </div>
                      <ul className="max-h-64 overflow-y-auto py-1">
                        {teamMembers
                          .filter((t) => t.is_active)
                          .filter((t) => !selectedMembers.some((m) => m.user_id === t.id))
                          .filter((t) =>
                            memberSearch.trim() === ''
                              ? true
                              : (t.full_name || t.email)
                                  .toLowerCase()
                                  .includes(memberSearch.trim().toLowerCase()),
                          )
                          .map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => addMember(t.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                              >
                                {t.avatar_url ? (
                                  <img
                                    src={t.avatar_url}
                                    alt=""
                                    className="h-6 w-6 rounded-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary">
                                    {(t.full_name || t.email)
                                      .split(' ')
                                      .map((p) => p[0])
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .join('')
                                      .toUpperCase()}
                                  </span>
                                )}
                                <span className="min-w-0 flex-1 truncate">
                                  {t.full_name || t.email}
                                </span>
                              </button>
                            </li>
                          ))}
                        {teamMembers
                          .filter((t) => t.is_active)
                          .filter((t) => !selectedMembers.some((m) => m.user_id === t.id))
                          .filter((t) =>
                            memberSearch.trim() === ''
                              ? true
                              : (t.full_name || t.email)
                                  .toLowerCase()
                                  .includes(memberSearch.trim().toLowerCase()),
                          ).length === 0 ? (
                          <li className="px-3 py-3 text-center text-xs text-muted">
                            No matching team members.{' '}
                            <Link
                              to="/team"
                              className="font-medium text-primary hover:underline"
                            >
                              Invite more people
                            </Link>
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Need someone new?{' '}
                  <Link to="/team" className="font-medium text-primary hover:underline">
                    Invite more people
                  </Link>{' '}
                  to your workspace.
                </p>
              </div>
            </section>

            {serverError ? (
              <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                {serverError}
              </div>
            ) : null}
          </div>
        </form>
      </main>

      {/* Sticky bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6 lg:px-8">
          <p className="text-xs text-muted">
            {stepDone.basics ? (
              <>
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-accent-dark" />
                Ready to create
              </>
            ) : (
              'Fill out client and project name to continue'
            )}
          </p>
          <div className="flex items-center gap-2">
            <Link to="/projects" className="btn-outline">
              Cancel
            </Link>
            <button
              type="submit"
              form=""
              onClick={handleSubmit}
              className="btn-primary"
              disabled={submitting || !stepDone.basics}
            >
              {submitting ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </div>
      </div>

      {clientModalOpen ? (
        <NewClientModal
          onClose={() => setClientModalOpen(false)}
          onCreated={(c) => {
            setClients((prev) => [...prev, c]);
            setClientId(c.id);
            setClientModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
