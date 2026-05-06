import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Circle,
  Clock,
  DollarSign,
  FileText,
  ListChecks,
  Plus,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import NewClientModal from '@/components/NewClientModal';
import { listClients } from '@/api/clients';
import { createProject, listTasks } from '@/api/projects';
import { extractApiError } from '@/utils/errors';
import type {
  BillableRateStrategy,
  BudgetType,
  Client,
  ProjectType,
  ProjectVisibility,
  Task,
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
] as const;

export default function NewProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectClientId = searchParams.get('client');

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
  const [budgetIncludesNonBillable, setBudgetIncludesNonBillable] = useState(false);
  const [budgetAlertPercent, setBudgetAlertPercent] = useState<string>('');

  const [projectType, setProjectType] = useState<ProjectType>('time_materials');
  const [billableRateStrategy, setBillableRateStrategy] =
    useState<BillableRateStrategy>('person');
  const [flatBillableRate, setFlatBillableRate] = useState('');

  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [billableTaskIds, setBillableTaskIds] = useState<Set<number>>(new Set());

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
  }, []);

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
        budget_includes_non_billable: budgetIncludesNonBillable,
        budget_alert_percent: budgetAlertPercent ? Number.parseInt(budgetAlertPercent, 10) : null,
        billable_rate_strategy: effectiveStrategy,
        flat_billable_rate:
          effectiveStrategy === 'project' && flatBillableRate.trim() !== ''
            ? flatBillableRate
            : null,
        task_ids: Array.from(selectedTaskIds),
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
    <div className="min-h-screen bg-bg pb-24">
      {/* Page header — full-width strip with subtle gradient */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-primary-soft/40 via-white to-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <Link
            to="/projects"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted transition hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                New project
              </p>
    
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

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[260px_1fr]">
          {/* Left rail — sticky step nav + live summary */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <nav className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              {STEPS.map((step) => {
                const done = stepDone[step.id as keyof typeof stepDone];
                const Icon = step.icon;
                return (
                  <a
                    key={step.id}
                    href={`#${step.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-bg"
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

            <div className="mt-4 rounded-xl border border-primary/15 bg-primary-soft/50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Live summary
              </p>
              <dl className="mt-3 space-y-2.5 text-sm">
                <div>
                  <dt className="text-xs text-muted">Client</dt>
                  <dd className="font-medium text-text">
                    {selectedClient?.name ?? <span className="text-muted">— not chosen —</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Budget</dt>
                  <dd className="font-medium text-text">{formatBudgetSummary()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Tasks</dt>
                  <dd className="font-medium text-text">
                    {selectedTaskIds.size} selected
                    {billableCount > 0 ? (
                      <span className="ml-1 text-xs text-muted">
                        ({billableCount} billable)
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>

          {/* Right pane — content sections */}
          <div className="space-y-6">
            {/* Basics */}
            <section
              id="basics"
              className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-6 py-4">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-text">Basics</h2>
                  <p className="text-xs text-muted">Who's the work for, and what's it called?</p>
                </div>
              </header>
              <div className="space-y-5 px-6 py-5">
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
              <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-6 py-4">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Briefcase className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-text">Type &amp; Rates</h2>
                  <p className="text-xs text-muted">
                    How this project is billed. Drives the Profitability report.
                  </p>
                </div>
              </header>
              <div className="space-y-5 px-6 py-5">
                <div>
                  <label className="label">Project type</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {PROJECT_TYPE_OPTIONS.map((opt) => {
                      const selected = projectType === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition ${
                            selected
                              ? 'border-primary bg-primary-soft/40'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="project_type"
                            checked={selected}
                            onChange={() => setProjectType(opt.value)}
                            className="mt-0.5 h-4 w-4 accent-primary"
                          />
                          <span>
                            <span className="block font-medium text-text">{opt.label}</span>
                            <span className="block text-xs leading-relaxed text-muted">
                              {opt.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {projectType !== 'non_billable' ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                    <h3 className="font-semibold text-text">Billable rates</h3>
                    <p className="mt-1 text-xs text-muted">
                      We need billable rates to track this project&apos;s billable amount.
                    </p>
                    <div className="mt-3">
                      <select
                        value={billableRateStrategy}
                        onChange={(e) =>
                          setBillableRateStrategy(e.target.value as BillableRateStrategy)
                        }
                        className="input w-full sm:w-72"
                      >
                        {BILLABLE_STRATEGY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-muted">
                        {BILLABLE_STRATEGY_OPTIONS.find((o) => o.value === billableRateStrategy)
                          ?.description}
                      </p>
                    </div>
                    {billableRateStrategy === 'project' ? (
                      <div className="mt-4">
                        <label htmlFor="flat_billable_rate" className="label">
                          Project rate
                        </label>
                        <div className="relative w-full max-w-[220px]">
                          <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                          <input
                            id="flat_billable_rate"
                            type="number"
                            min={0}
                            step={0.01}
                            value={flatBillableRate}
                            onChange={(e) => setFlatBillableRate(e.target.value)}
                            className="input pl-9"
                            placeholder="0.00"
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted">Charged per hour, regardless of who tracked it.</p>
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
              <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-6 py-4">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Clock className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-text">Budget (hours)</h2>
                  <p className="text-xs text-muted">Cap project hours and get alerts before going over.</p>
                </div>
              </header>
              <div className="space-y-5 px-6 py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={budgetType}
                    onChange={(e) => setBudgetType(e.target.value as BudgetType)}
                    className="input flex-initial"
                  >
                    {availableBudgetOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {budgetNeedsAmount ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={budgetAmount}
                        onChange={(e) => setBudgetAmount(e.target.value)}
                        className="input w-44"
                        placeholder="0.00"
                      />
                      <span className="text-sm font-medium text-muted">hours</span>
                    </div>
                  ) : null}
                </div>

                {budgetNeedsAmount ? (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-bg/40 p-4">
                    <label className="flex items-center gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={budgetResetsMonthly}
                        onChange={(e) => setBudgetResetsMonthly(e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      Budget resets every month
                    </label>
                    <label className="flex items-center gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={budgetIncludesNonBillable}
                        onChange={(e) => setBudgetIncludesNonBillable(e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      Include billable and non-billable expenses
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
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
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
                <div className="grid grid-cols-[1fr_120px] gap-4 bg-slate-50/50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <div>Task</div>
                  <div className="text-right">Billable</div>
                </div>
                {sortedTasks.map((task) => {
                  const isSelected = selectedTaskIds.has(task.id);
                  const isBillable = billableTaskIds.has(task.id);
                  return (
                    <label
                      key={task.id}
                      className={`grid cursor-pointer grid-cols-[1fr_120px] items-center gap-4 px-6 py-3 text-sm transition hover:bg-slate-50/50 ${
                        isSelected ? '' : 'opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTask(task.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="font-medium text-text">{task.name}</span>
                        {task.is_default ? (
                          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <div className="flex justify-end">
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
                    </label>
                  );
                })}
              </div>
              <p className="border-t border-slate-100 bg-slate-50/30 px-6 py-3 text-xs text-muted">
                Tasks are managed under Manage → Tasks.
              </p>
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
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
