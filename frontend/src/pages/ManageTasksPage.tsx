import {
  Archive,
  CheckSquare,
  ChevronDown,
  DollarSign,
  Download,
  Edit3,
  ListTodo,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import ManageSubnav from '@/components/ManageSubnav';
import PageHero from '@/components/PageHero';
import { useConfirm } from '@/components/ConfirmDialog';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import {
  archiveTask,
  createTask,
  deleteTask,
  listTasks,
  restoreTask,
  updateTask,
} from '@/api/projects';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import type { Task, TaskCreatePayload } from '@/types';

type StatusFilter = 'active' | 'archived';

export default function ManageTasksPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'owner' || user?.role === 'admin';
  const { confirmDialog, ask } = useConfirm();

  const { pending: pendingDelete, scheduleDelete, undo: handleUndoDelete } = useUndoDelete<Task>({
    apiDelete: async (t) => { await deleteTask(t.id); },
    removeFromList: (t) => setTasks((prev) => prev.filter((x) => x.id !== t.id)),
    restoreToList: (t, idx) => setTasks((prev) => {
      const next = [...prev];
      next.splice(idx, 0, t);
      return next;
    }),
    getLabel: (t) => t.name,
    onError: (err) => alert(extractApiError(err, 'Failed to delete task.')),
  });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTasks({
      is_active: statusFilter === 'active',
      search: search.trim() || undefined,
    })
      .then((res) => {
        if (!cancelled) {
          setTasks(res.results);
          setSelectedIds(new Set());
        }
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiError(err, 'Failed to load tasks'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, search]);

  const { common, other } = useMemo(() => {
    return {
      common: tasks.filter((t) => t.is_default),
      other: tasks.filter((t) => !t.is_default),
    };
  }, [tasks]);

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: Task[]) => {
    const ids = group.map((t) => t.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleArchive = async (task: Task) => {
    const ok = await ask({
      title: `Archive "${task.name}"?`,
      message: 'Archived tasks are hidden from active lists. You can restore them anytime.',
      confirmLabel: 'Archive',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await archiveTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      alert(extractApiError(err, 'Failed to archive task.'));
    }
    setOpenMenuId(null);
  };

  const handleRestore = async (task: Task) => {
    try {
      await restoreTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      alert(extractApiError(err, 'Failed to restore task.'));
    }
    setOpenMenuId(null);
  };

  const handleDelete = async (task: Task) => {
    const ok = await ask({
      title: `Delete "${task.name}"?`,
      message: "You'll have 5 seconds to undo.",
      confirmLabel: 'Delete task',
      tone: 'danger',
    });
    if (!ok) return;
    setOpenMenuId(null);
    const index = tasks.findIndex((t) => t.id === task.id);
    scheduleDelete(task, index);
  };

  const bulkArchive = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await ask({
      title: `Archive ${ids.length} selected task${ids.length === 1 ? '' : 's'}?`,
      message: 'Archived tasks are hidden from active lists. You can restore them anytime.',
      confirmLabel: 'Archive selected',
      tone: 'warning',
    });
    if (!ok) return;
    setBulkOpen(false);
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await archiveTask(id);
      } catch (err) {
        failures.push(extractApiError(err, `Failed to archive #${id}`));
      }
    }
    setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id) || failures.length > 0));
    setSelectedIds(new Set());
    if (failures.length) alert(failures.join('\n'));
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await ask({
      title: `Delete ${ids.length} selected task${ids.length === 1 ? '' : 's'}?`,
      message: 'This action is permanent and cannot be undone.',
      confirmLabel: 'Delete selected',
      tone: 'danger',
    });
    if (!ok) return;
    setBulkOpen(false);
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await deleteTask(id);
      } catch (err) {
        failures.push(extractApiError(err, `Failed to delete #${id}`));
      }
    }
    setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
    if (failures.length) alert(failures.join('\n'));
  };

  const exportData = (format: 'csv' | 'excel') => {
    const headers = ['Name', 'Group', 'Billable', 'Status'];
    const rows = tasks.map((t) => [
      t.name,
      t.is_default ? 'Common' : 'Other',
      t.default_is_billable ? 'Yes' : 'No',
      t.is_active ? 'Active' : 'Archived',
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? '');
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(','),
      )
      .join('\n');
    const ext = format === 'excel' ? 'xls' : 'csv';
    const mime = format === 'excel' ? 'application/vnd.ms-excel' : 'text/csv';
    const blob = new Blob([csv], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="min-h-screen bg-bg">
      <PageHero
        eyebrow="Workspace"
        title="Tasks"
        description="The shared task library that powers every project — set defaults, archive, or import in bulk."
      />
      <ManageSubnav />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {hasSelection ? (
          <div className="mb-5 flex flex-col items-start gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setBulkOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-text shadow-sm transition hover:bg-slate-50"
              >
                Archive or delete selected tasks
                <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {selectedIds.size}
                </span>
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>
              {bulkOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setBulkOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute left-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
                    <button
                      type="button"
                      onClick={bulkArchive}
                      className="block w-full px-3 py-2 text-left transition hover:bg-bg"
                    >
                      Archive selected
                    </button>
                    <button
                      type="button"
                      onClick={bulkDelete}
                      className="block w-full px-3 py-2 text-left text-danger transition hover:bg-danger/10"
                    >
                      Delete selected
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by task name"
                className="input w-full pl-9"
              />
            </div>
          </div>
        ) : (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setModalOpen(true);
                  }}
                  className="btn-primary"
                >
                  <Plus className="h-4 w-4" />
                  New task
                </button>
              ) : null}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen((o) => !o)}
                  className="btn-outline"
                >
                  <Download className="h-4 w-4" />
                  Export
                  <ChevronDown className="h-4 w-4 text-muted" />
                </button>
                {exportOpen ? (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setExportOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute left-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
                      <button
                        type="button"
                        onClick={() => exportData('csv')}
                        className="block w-full px-3 py-2 text-left transition hover:bg-bg"
                      >
                        Export to CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => exportData('excel')}
                        className="block w-full px-3 py-2 text-left transition hover:bg-bg"
                      >
                        Export to Excel
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex w-full flex-nowrap items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by task name"
                  className="input w-full pl-9"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="input w-auto shrink-0"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
            Loading tasks…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
            {error}
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-16 text-center shadow-md">
            <p className="text-sm text-muted">
              {statusFilter === 'active' ? 'No tasks yet.' : 'No archived tasks.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <TaskGroup
              title="Common tasks"
              hint="These tasks are automatically added to all new projects."
              tone="primary"
              tasks={common}
              canEdit={canEdit}
              selectedIds={selectedIds}
              onToggleOne={toggleOne}
              onToggleGroup={() => toggleGroup(common)}
              openMenuId={openMenuId}
              onToggleMenu={(id) => setOpenMenuId((cur) => (cur === id ? null : id))}
              onCloseMenu={() => setOpenMenuId(null)}
              onEdit={(t) => {
                setEditing(t);
                setModalOpen(true);
              }}
              onArchive={handleArchive}
              onRestore={handleRestore}
              onDelete={handleDelete}
              statusFilter={statusFilter}
            />
            <TaskGroup
              title="Other tasks"
              hint="These tasks must be manually added to projects."
              tone="accent"
              tasks={other}
              canEdit={canEdit}
              selectedIds={selectedIds}
              onToggleOne={toggleOne}
              onToggleGroup={() => toggleGroup(other)}
              openMenuId={openMenuId}
              onToggleMenu={(id) => setOpenMenuId((cur) => (cur === id ? null : id))}
              onCloseMenu={() => setOpenMenuId(null)}
              onEdit={(t) => {
                setEditing(t);
                setModalOpen(true);
              }}
              onArchive={handleArchive}
              onRestore={handleRestore}
              onDelete={handleDelete}
              statusFilter={statusFilter}
            />

            {pendingDelete ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-6 py-2.5 text-sm shadow-sm">
                <span className="text-text">
                  <strong className="font-semibold">{pendingDelete.label}</strong>{' '}
                  has been deleted.{' '}
                  <button
                    type="button"
                    onClick={handleUndoDelete}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Undo
                  </button>
                </span>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {modalOpen ? (
        <TaskModal
          initial={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={(t) => {
            setTasks((prev) => {
              const idx = prev.findIndex((p) => p.id === t.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = t;
                return next;
              }
              return [...prev, t];
            });
            setModalOpen(false);
            setEditing(null);
          }}
        />
      ) : null}

      {confirmDialog}
    </div>
  );
}

function GroupCheckbox({
  state,
  onChange,
  disabled,
}: {
  state: 'none' | 'some' | 'all';
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      checked={state === 'all'}
      ref={(el) => {
        if (el) el.indeterminate = state === 'some';
      }}
      disabled={disabled}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer accent-primary"
      aria-label="Select all in group"
    />
  );
}

function TaskGroup({
  title,
  hint,
  tone,
  tasks,
  canEdit,
  selectedIds,
  onToggleOne,
  onToggleGroup,
  openMenuId,
  onToggleMenu,
  onCloseMenu,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  statusFilter,
}: {
  title: string;
  hint: string;
  tone: 'primary' | 'accent';
  tasks: Task[];
  canEdit: boolean;
  selectedIds: Set<number>;
  onToggleOne: (id: number) => void;
  onToggleGroup: () => void;
  openMenuId: number | null;
  onToggleMenu: (id: number) => void;
  onCloseMenu: () => void;
  onEdit: (t: Task) => void;
  onArchive: (t: Task) => void;
  onRestore: (t: Task) => void;
  onDelete: (t: Task) => void;
  statusFilter: StatusFilter;
}) {
  const ids = tasks.map((t) => t.id);
  const selectedCount = ids.filter((id) => selectedIds.has(id)).length;
  const groupState: 'none' | 'some' | 'all' =
    selectedCount === 0 ? 'none' : selectedCount === ids.length ? 'all' : 'some';
  const Icon = tone === 'primary' ? CheckSquare : ListTodo;
  const iconBg = 'bg-primary text-white';
  const dotColor = 'bg-primary';
  const headerBg = 'bg-primary-soft';

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-md">
      <div className={`grid grid-cols-[24px_auto_1fr_auto] items-center gap-3 rounded-t-xl border-b border-slate-200 px-4 py-4 sm:gap-4 sm:px-6 ${headerBg}`}>
        <div className="flex items-center">
          {canEdit ? (
            <GroupCheckbox state={groupState} onChange={onToggleGroup} disabled={tasks.length === 0} />
          ) : null}
        </div>
        <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-heading text-base font-bold text-text">{title}</p>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <div className="flex items-center justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-text shadow-sm ring-1 ring-slate-200">
            <span className="tabular-nums">{tasks.length}</span>
            <span className="text-muted">{tasks.length === 1 ? 'task' : 'tasks'}</span>
          </span>
        </div>
      </div>
      {tasks.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-muted">
          No {statusFilter} tasks in this group.
        </div>
      ) : (
        tasks.map((t) => {
          const checked = selectedIds.has(t.id);
          return (
            <div
              key={t.id}
              className={`grid grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-sm transition last:rounded-b-xl last:border-b-0 sm:gap-4 sm:px-6 ${
                checked ? 'bg-warning/10' : 'hover:bg-slate-50/70'
              }`}
            >
              <div className="flex items-center">
                {canEdit ? (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleOne(t.id)}
                    className="h-4 w-4 cursor-pointer accent-primary"
                    aria-label={`Select ${t.name}`}
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor} ${t.is_active ? '' : 'opacity-40'}`} aria-hidden="true" />
                <span
                  className={`font-semibold ${t.is_active ? 'text-text' : 'text-muted'}`}
                >
                  {t.name}
                </span>
                {t.default_is_billable ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-dark">
                    Billable
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-muted">
                    Non-billable
                  </span>
                )}
                {!t.is_active ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                    Archived
                  </span>
                ) : null}
                {!t.is_active && canEdit ? (
                  <button
                    type="button"
                    onClick={() => onRestore(t)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-dark/30 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-dark transition hover:bg-accent-soft/70"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore
                  </button>
                ) : null}
              </div>
              <div className="flex justify-end">
                {canEdit ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onToggleMenu(t.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-text transition hover:bg-slate-100"
                    >
                      Actions
                      <ChevronDown className="h-4 w-4 text-muted" />
                    </button>
                    {openMenuId === t.id ? (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={onCloseMenu}
                          aria-hidden="true"
                        />
                        <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
                          {t.is_active ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  onCloseMenu();
                                  onEdit(t);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-bg"
                              >
                                <Edit3 className="h-4 w-4" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onArchive(t)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-warning transition hover:bg-warning/10"
                              >
                                <Archive className="h-4 w-4" /> Archive
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onRestore(t)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-bg"
                            >
                              <RotateCcw className="h-4 w-4" /> Restore
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDelete(t)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-danger transition hover:bg-danger/10"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function TaskModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Task | null;
  onClose: () => void;
  onSaved: (t: Task) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [isBillable, setIsBillable] = useState(initial?.default_is_billable ?? true);
  const [defaultBillableRate, setDefaultBillableRate] = useState(
    initial?.default_billable_rate ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrMsg('Task name is required.');
      return;
    }
    setSaving(true);
    setErrMsg(null);
    const payload: TaskCreatePayload = {
      name: name.trim(),
      is_default: isDefault,
      default_is_billable: isBillable,
      default_billable_rate: isBillable && defaultBillableRate.trim() !== ''
        ? defaultBillableRate.trim()
        : null,
    };
    try {
      const saved = initial
        ? await updateTask(initial.id, payload)
        : await createTask(payload);
      onSaved(saved);
    } catch (err) {
      setErrMsg(extractApiError(err, 'Could not save task.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">
            {initial ? 'Edit task' : 'New task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 py-5">
            <div>
              <label className="label">Task name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                required
                autoFocus
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Auto-add this task to all new projects
            </label>

            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              This task is billable by default
            </label>
            <p className="-mt-2 text-xs text-muted">
              Used to classify hours in reports — billable vs non-billable utilization.
            </p>

            {isBillable ? (
              <div>
                <label htmlFor="default_billable_rate" className="label">
                  Default billable rate <span className="font-normal text-muted">(optional)</span>
                </label>
                <div className="relative w-full max-w-[220px]">
                  <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="default_billable_rate"
                    type="number"
                    min={0}
                    step={0.01}
                    value={defaultBillableRate}
                    onChange={(e) => setDefaultBillableRate(e.target.value)}
                    className="input pl-9 pr-12"
                    placeholder="0.00"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
                    / hr
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Used when a project's billable rate strategy is set to <span className="font-medium">Task billable rate</span>. Leave empty to track hours as non-billable.
                </p>
              </div>
            ) : null}
          </div>

          {errMsg ? (
            <div className="mx-6 mb-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {errMsg}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
            <button type="button" onClick={onClose} className="btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save task' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
