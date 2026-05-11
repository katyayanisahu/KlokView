import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  FolderKanban,
  FolderPlus,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useConfirm } from '@/components/ConfirmDialog';
import PageHero from '@/components/PageHero';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import {
  archiveProject,
  deleteProject,
  duplicateProject,
  listProjects,
  restoreProject,
} from '@/api/projects';
import { listUsers } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import { formatBudget, formatCurrency, PROJECT_TYPE_LABEL } from '@/utils/format';
import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import type { ProjectListItem, User } from '@/types';

type StatusFilter = 'active' | 'archived';

const PIN_STORAGE_KEY = 'trackflow:pinnedProjects';

function loadPinned(): Set<number> {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function savePinned(set: Set<number>) {
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore quota errors
  }
}

export default function ProjectsListPage() {
  // Re-render when the workspace currency / number_format changes in Settings.
  useAccountSettingsStore((s) => s.settings?.currency);
  useAccountSettingsStore((s) => s.settings?.number_format);

  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'owner' || user?.role === 'admin';
  const { confirmDialog, ask } = useConfirm();

  const { pending: pendingDelete, scheduleDelete, undo: handleUndoDelete } = useUndoDelete<ProjectListItem>({
    apiDelete: async (p) => { await deleteProject(p.id); },
    removeFromList: (p) => setProjects((prev) => prev.filter((x) => x.id !== p.id)),
    restoreToList: (p, idx) => setProjects((prev) => {
      const next = [...prev];
      next.splice(idx, 0, p);
      return next;
    }),
    getLabel: (p) => p.name,
    onError: (err) => alert(extractApiError(err, 'Failed to delete project.')),
  });
  const canSeeManagerFilter =
    user?.role === 'owner' || user?.role === 'admin' || user?.role === 'manager';

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<number | 'all'>('all');
  const [managerFilter, setManagerFilter] = useState<number | 'all'>('all');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [pinned, setPinned] = useState<Set<number>>(() => loadPinned());

  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  const refresh = () => {
    setLoading(true);
    setError(null);
    listProjects({
      is_active: status === 'active',
      search: search.trim() || undefined,
      client_id: clientFilter === 'all' ? undefined : clientFilter,
      manager_id: managerFilter === 'all' ? undefined : managerFilter,
    })
      .then((res) => setProjects(res.results))
      .catch((err) => setError(extractApiError(err, 'Failed to load projects')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listProjects({
      is_active: status === 'active',
      search: search.trim() || undefined,
      client_id: clientFilter === 'all' ? undefined : clientFilter,
      manager_id: managerFilter === 'all' ? undefined : managerFilter,
    })
      .then((res) => {
        if (!cancelled) {
          setProjects(res.results);
          setSelectedIds(new Set());
        }
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiError(err, 'Failed to load projects'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, search, clientFilter, managerFilter]);

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkArchive = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await ask({
      title: `Archive ${ids.length} selected project${ids.length === 1 ? '' : 's'}?`,
      message: 'Archived projects are hidden from active lists. You can restore them anytime.',
      confirmLabel: 'Archive selected',
      tone: 'warning',
    });
    if (!ok) return;
    setBulkOpen(false);
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await archiveProject(id);
      } catch (err) {
        failures.push(extractApiError(err, `Failed to archive #${id}`));
      }
    }
    setProjects((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    if (failures.length) alert(failures.join('\n'));
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await ask({
      title: `Delete ${ids.length} selected project${ids.length === 1 ? '' : 's'}?`,
      message: 'This is permanent and will also remove all logged time entries.',
      confirmLabel: 'Delete selected',
      tone: 'danger',
    });
    if (!ok) return;
    setBulkOpen(false);
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await deleteProject(id);
      } catch (err) {
        failures.push(extractApiError(err, `Failed to delete #${id}`));
      }
    }
    setProjects((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    if (failures.length) alert(failures.join('\n'));
  };

  const hasSelection = selectedIds.size > 0;

  const groupedByClient = useMemo(() => {
    // separate pinned from rest, then group rest by client
    const pinnedList = projects.filter((p) => pinned.has(p.id));
    const rest = projects.filter((p) => !pinned.has(p.id));
    const groups = new Map<string, { clientId: number; projects: ProjectListItem[] }>();
    for (const p of rest) {
      const key = p.client_name;
      if (!groups.has(key)) groups.set(key, { clientId: p.client_id, projects: [] });
      groups.get(key)!.projects.push(p);
    }
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
    return { pinnedList, sorted };
  }, [projects, pinned]);

  const clientOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const p of projects) if (!seen.has(p.client_id)) seen.set(p.client_id, p.client_name);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [projects]);

  // Manager filter shows ONLY users actually flagged is_project_manager on at
  // least one loaded project — not all admin/owner/manager roles. Backend
  // applies the same flag on the manager_id query param.
  const managerOptions = useMemo(() => {
    const managerIds = new Set<number>();
    projects.forEach((p) => p.manager_ids.forEach((id) => managerIds.add(id)));
    return users
      .filter((u) => managerIds.has(u.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [projects, users]);

  const togglePin = (id: number) => {
    const next = new Set(pinned);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPinned(next);
    savePinned(next);
    setOpenMenuId(null);
  };

  const handleArchive = async (project: ProjectListItem) => {
    const ok = await ask({
      title: `Archive "${project.name}"?`,
      message: 'Archived projects are hidden from active lists. You can restore them anytime.',
      confirmLabel: 'Archive',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await archiveProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      alert(extractApiError(err, 'Failed to archive project.'));
    }
    setOpenMenuId(null);
  };

  const handleRestore = async (project: ProjectListItem) => {
    try {
      await restoreProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      alert(extractApiError(err, 'Failed to restore project.'));
    }
    setOpenMenuId(null);
  };

  const handleDelete = async (project: ProjectListItem) => {
    const ok = await ask({
      title: `Delete "${project.name}"?`,
      message:
        "This will remove the project and any logged time entries. You'll have 5 seconds to undo.",
      confirmLabel: 'Delete project',
      tone: 'danger',
    });
    if (!ok) return;
    setOpenMenuId(null);
    const index = projects.findIndex((p) => p.id === project.id);
    scheduleDelete(project, index);
  };

  const handleDuplicate = async (project: ProjectListItem) => {
    try {
      const copy = await duplicateProject(project.id);
      setOpenMenuId(null);
      navigate(`/projects/${copy.id}`);
    } catch (err) {
      alert(extractApiError(err, 'Failed to duplicate project.'));
    }
  };

  const exportCsv = (scope: 'active' | 'budgeted' | 'archived', format: 'csv' | 'excel') => {
    let scoped = projects;
    if (scope === 'archived') scoped = projects.filter((p) => !p.is_active);
    if (scope === 'active') scoped = projects.filter((p) => p.is_active);
    if (scope === 'budgeted') scoped = projects.filter((p) => p.budget_type !== 'none');

    const headers = ['Client', 'Project', 'Project Code', 'Project Type', 'Budget Type', 'Budget Amount', 'Status'];
    const rows = scoped.map((p) => [
      p.client_name,
      p.name,
      p.code,
      PROJECT_TYPE_LABEL[p.project_type],
      p.budget_type,
      p.budget_amount ?? '',
      p.is_active ? 'Active' : 'Archived',
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
    a.download = `projects-${scope}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const counts = {
    active: projects.filter((p) => p.is_active).length,
    archived: projects.filter((p) => !p.is_active).length,
    budgeted: projects.filter((p) => p.budget_type !== 'none').length,
  };

  const filterChipsActive = clientFilter !== 'all' || managerFilter !== 'all';

  return (
    <div className="min-h-screen bg-bg">
      <PageHero
        eyebrow="Workspace"
        title="Projects"
        description="Track budgets, costs, and team allocation across every engagement."
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => navigate('/projects/new')}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" />
              New project
            </button>
          ) : null
        }
      />

      {!loading && !error && projects.length > 0 ? (
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => setStatus('active')}
                className={`group flex items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  status === 'active'
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-slate-200'
                }`}
              >
                <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <FolderKanban className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Active
                  </p>
                  <p className="font-heading text-2xl font-bold leading-tight text-text">
                    {counts.active}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary-soft/50 px-4 py-3.5 shadow-sm">
                <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
                  <Target className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    With budget
                  </p>
                  <p className="font-heading text-2xl font-bold leading-tight text-primary">
                    {counts.budgeted}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3.5 shadow-sm">
                <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-accent-dark shadow-sm">
                  <Pin className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent-dark">
                    Pinned
                  </p>
                  <p className="font-heading text-2xl font-bold leading-tight text-accent-dark">
                    {groupedByClient.pinnedList.length}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatus('archived')}
                className={`group flex items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  status === 'archived'
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-slate-200'
                }`}
              >
                <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-muted">
                  <Archive className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Archived
                  </p>
                  <p className="font-heading text-2xl font-bold leading-tight text-muted">
                    {counts.archived}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        {/* Search + bulk action bar */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:min-w-[260px] sm:flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project or client…"
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-md transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {canEdit ? (
            <button type="button" onClick={() => setImportOpen(true)} className="btn-outline flex-1 justify-center sm:flex-none">
              <Upload className="h-4 w-4" />
              Import
            </button>
          ) : null}
          <button type="button" onClick={() => setExportOpen(true)} className="btn-outline flex-1 justify-center sm:flex-none">
            <Download className="h-4 w-4" />
            Export
          </button>

          {canEdit && hasSelection ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setBulkOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-4 py-2 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary-soft/70"
              >
                {selectedIds.size} selected
                <ChevronDown className="h-4 w-4" />
              </button>
              {bulkOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setBulkOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
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
          ) : null}
        </div>

        {/* Filter chip bar — pill-style, distinct from Harvest's dropdown row */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Filter</span>
          <ChipSelect
            label="Client"
            value={clientFilter}
            onChange={(v) => setClientFilter(v as number | 'all')}
            options={[
              { value: 'all', label: 'All clients' },
              ...clientOptions.map(([id, name]) => ({ value: id, label: name })),
            ]}
            disabled={hasSelection}
          />
          {canSeeManagerFilter ? (
            <ChipSelect
              label="Manager"
              value={managerFilter}
              onChange={(v) => setManagerFilter(v as number | 'all')}
              options={[
                { value: 'all', label: 'All managers' },
                ...managerOptions.map((u) => ({ value: u.id, label: u.full_name })),
              ]}
              disabled={hasSelection}
            />
          ) : null}
          {filterChipsActive && !hasSelection ? (
            <button
              type="button"
              onClick={() => {
                setClientFilter('all');
                setManagerFilter('all');
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
            Loading projects…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
            {error}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-8 py-16 text-center shadow-md">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
              <FolderPlus className="h-8 w-8 text-primary" />
            </span>
            <h2 className="mt-6 font-heading text-xl font-bold text-text">
              {status === 'active' ? 'No active projects' : 'No archived projects'}
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted">
              {status === 'active'
                ? 'Create your first project to start tracking time against clients.'
                : 'Archived projects will show here.'}
            </p>
            {canEdit && status === 'active' ? (
              <Link to="/projects/new" className="btn-primary mt-6">
                <Plus className="h-4 w-4" />
                New project
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-6">
            {(() => {
              const pendingItem = pendingDelete?.item;
              const pendingIsPinned = pendingItem ? pinned.has(pendingItem.id) : false;
              const pendingClientName = pendingItem?.client_name ?? null;
              const pinnedGroupShown = groupedByClient.pinnedList.length > 0;
              const clientGroupShown = pendingClientName
                ? groupedByClient.sorted.some(([n]) => n === pendingClientName)
                : false;
              const showInlineInPinned = !!pendingDelete && pendingIsPinned && pinnedGroupShown;
              const showInlineInClient = !!pendingDelete && !pendingIsPinned && clientGroupShown;
              const showOrphan =
                !!pendingDelete && !showInlineInPinned && !showInlineInClient;

              return (
                <>
                  {/* Pinned section — separate card with amber accent */}
                  {pinnedGroupShown ? (
                    <ClientGroupCard
                      title="Pinned"
                      accent="amber"
                      projectCount={groupedByClient.pinnedList.length}
                    >
                      {groupedByClient.pinnedList.map((p) => (
                        <ProjectRow
                          key={`pinned-${p.id}`}
                          project={p}
                          canEdit={canEdit}
                          isPinned
                          selected={selectedIds.has(p.id)}
                          onToggleSelect={() => toggleOne(p.id)}
                          isOpen={openMenuId === p.id}
                          onToggleMenu={() =>
                            setOpenMenuId((id) => (id === p.id ? null : p.id))
                          }
                          onClose={() => setOpenMenuId(null)}
                          onEdit={() => navigate(`/projects/${p.id}`)}
                          onPin={() => togglePin(p.id)}
                          onDuplicate={() => handleDuplicate(p)}
                          onArchive={() => handleArchive(p)}
                          onRestore={() => handleRestore(p)}
                          onDelete={() => handleDelete(p)}
                        />
                      ))}
                      {showInlineInPinned ? (
                        <UndoStripRow
                          label={pendingDelete!.label}
                          onUndo={handleUndoDelete}
                        />
                      ) : null}
                    </ClientGroupCard>
                  ) : null}

                  {/* Each client = its own card with header */}
                  {groupedByClient.sorted.map(([clientName, group]) => (
                    <ClientGroupCard
                      key={clientName}
                      title={clientName}
                      clientId={group.clientId}
                      accent="primary"
                      projectCount={group.projects.length}
                    >
                      {group.projects.map((p) => (
                        <ProjectRow
                          key={p.id}
                          project={p}
                          canEdit={canEdit}
                          isPinned={false}
                          selected={selectedIds.has(p.id)}
                          onToggleSelect={() => toggleOne(p.id)}
                          isOpen={openMenuId === p.id}
                          onToggleMenu={() =>
                            setOpenMenuId((id) => (id === p.id ? null : p.id))
                          }
                          onClose={() => setOpenMenuId(null)}
                          onEdit={() => navigate(`/projects/${p.id}`)}
                          onPin={() => togglePin(p.id)}
                          onDuplicate={() => handleDuplicate(p)}
                          onArchive={() => handleArchive(p)}
                          onRestore={() => handleRestore(p)}
                          onDelete={() => handleDelete(p)}
                        />
                      ))}
                      {showInlineInClient && pendingClientName === clientName ? (
                        <UndoStripRow
                          label={pendingDelete!.label}
                          onUndo={handleUndoDelete}
                        />
                      ) : null}
                    </ClientGroupCard>
                  ))}

                  {showOrphan ? (
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-6 py-3 text-sm shadow-sm">
                      <span className="text-text">
                        <strong className="font-semibold">{pendingDelete!.label}</strong>{' '}
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
                </>
              );
            })()}
          </div>
        )}
      </main>

      {importOpen ? (
        <ImportProjectsModal onClose={() => setImportOpen(false)} onImported={refresh} />
      ) : null}

      {exportOpen ? (
        <ExportProjectsModal
          onClose={() => setExportOpen(false)}
          onExport={exportCsv}
          counts={counts}
        />
      ) : null}

      {confirmDialog}
    </div>
  );
}

function ChipSelect<T extends number | 'all'>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const isActive = value !== 'all';

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-sm transition ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-white text-muted/50 shadow-none'
            : isActive
              ? 'border-primary bg-primary-soft text-primary shadow-md hover:bg-primary-soft/70'
              : 'border-slate-300 bg-white text-text hover:border-primary/40 hover:bg-slate-50 hover:shadow-md'
        }`}
      >
        <span className="text-muted">{label}:</span>
        <span className={isActive ? 'font-semibold' : ''}>
          {current?.label ?? 'All'}
        </span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
            {options.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left transition hover:bg-bg ${
                  opt.value === value ? 'bg-primary-soft/40 font-semibold text-primary' : 'text-text'
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

function ClientGroupCard({
  title,
  clientId,
  projectCount,
  accent,
  children,
}: {
  title: string;
  clientId?: number;
  projectCount: number;
  accent: 'primary' | 'amber';
  children: React.ReactNode;
}) {
  const initial = title.replace(/^\[SAMPLE\]\s*/i, '').trim().charAt(0).toUpperCase() || '?';
  const accentClasses =
    accent === 'amber'
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : 'bg-primary-soft border-primary/20 text-primary';
  const avatarClasses =
    accent === 'amber'
      ? 'bg-amber-500 text-white'
      : 'bg-primary text-white';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header
        className={`flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b ${accentClasses} px-5 py-3`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full font-heading text-sm font-bold ${avatarClasses}`}
          >
            {accent === 'amber' ? <Pin className="h-4 w-4" /> : initial}
          </span>
          {clientId ? (
            <Link
              to={`/clients/${clientId}`}
              className="font-heading text-base font-bold hover:underline"
            >
              {title}
            </Link>
          ) : (
            <span className="font-heading text-base font-bold">{title}</span>
          )}
        </div>
        <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold">
          {projectCount} {projectCount === 1 ? 'project' : 'projects'}
        </span>
      </header>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function UndoStripRow({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-slate-50/70 px-5 py-3 text-sm">
      <span className="text-text">
        <strong className="font-semibold">{label}</strong> has been deleted.{' '}
        <button
          type="button"
          onClick={onUndo}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          Undo
        </button>
      </span>
      <span className="text-[11px] uppercase tracking-wider text-muted">
        Auto-removes in 5s
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-0.5 tabular-nums font-medium ${
          tone === 'danger' ? 'text-danger' : 'text-text'
        }`}
      >
        {value}
        {sub ? <span className="ml-1 text-[11px] font-normal text-muted">{sub}</span> : null}
      </p>
    </div>
  );
}

function ProjectRow({
  project,
  canEdit,
  isPinned,
  selected,
  onToggleSelect,
  isOpen,
  onToggleMenu,
  onClose,
  onEdit,
  onPin,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: ProjectListItem;
  canEdit: boolean;
  isPinned: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  isOpen: boolean;
  onToggleMenu: () => void;
  onClose: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const budget = formatBudget(project.budget_amount, project.budget_type);
  const budgetNum = Number.parseFloat(project.budget_amount ?? '0');
  const spentNum = Number.parseFloat(project.spent_amount ?? '0');
  const remainingNum = budgetNum - spentNum;
  const overBudget = spentNum > budgetNum && budgetNum > 0;
  const remainingPct =
    budgetNum > 0 ? Math.round(((remainingNum) / budgetNum) * 100) : 0;
  let bluePct = 0;
  let redPct = 0;
  if (budgetNum > 0) {
    if (overBudget) {
      bluePct = (budgetNum / spentNum) * 100;
      redPct = 100 - bluePct;
    } else {
      bluePct = Math.min((spentNum / budgetNum) * 100, 100);
    }
  }

  const projectInitial = project.name.replace(/^\[SAMPLE\]\s*/i, '').trim().charAt(0).toUpperCase() || 'P';

  return (
    <div
      className={`group px-5 py-4 transition ${
        selected ? 'bg-warning/10' : 'hover:bg-slate-50/50'
      }`}
    >
      <div className="flex items-start gap-4">
        {canEdit ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
            aria-label={`Select ${project.name}`}
          />
        ) : null}

        {/* Project avatar tile */}
        <span
          className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-heading text-sm font-bold ${
            project.is_active
              ? 'bg-primary-soft text-primary'
              : 'bg-slate-100 text-muted opacity-70'
          }`}
        >
          {projectInitial}
        </span>

        {/* Main project info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isPinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : null}
            <Link
              to={`/projects/${project.id}`}
              className={`truncate font-semibold hover:text-primary hover:underline ${
                project.is_active ? 'text-text' : 'text-muted'
              }`}
            >
              {project.name}
            </Link>
            {!project.is_active ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                Archived
              </span>
            ) : null}
            {!project.is_active && canEdit ? (
              <button
                type="button"
                onClick={onRestore}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-dark/30 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-dark transition hover:bg-accent-soft/70"
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </button>
            ) : null}
          </div>

          {/* Metrics grid */}
          <div
            className={`mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:gap-x-6 ${
              canEdit ? 'sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-1' : 'sm:grid-cols-3 sm:gap-y-1'
            }`}
          >
            <Metric
              label="Budget"
              value={project.budget_type === 'none' ? '—' : budget}
            />
            <Metric
              label="Spent"
              value={
                project.budget_type === 'none'
                  ? '—'
                  : formatBudget(project.spent_amount ?? '0', project.budget_type)
              }
            />
            <Metric
              label="Remaining"
              value={
                project.budget_type === 'none'
                  ? '—'
                  : formatBudget(String(remainingNum), project.budget_type)
              }
              sub={
                budgetNum > 0
                  ? `(${overBudget ? '-' : ''}${Math.abs(remainingPct)}%)`
                  : undefined
              }
              tone={overBudget ? 'danger' : 'default'}
            />
            {canEdit ? (
              <Metric
                label="Costs"
                value={formatCurrency(project.cost_amount ?? '0')}
              />
            ) : null}
          </div>

          {/* Progress bar — full width below metrics */}
          {project.budget_type !== 'none' && budgetNum > 0 ? (
            <div className="mt-3">
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${bluePct}%` }}
                />
                {redPct > 0 ? (
                  <div
                    className="h-full bg-danger transition-all"
                    style={{ width: `${redPct}%` }}
                  />
                ) : null}
              </div>
              {spentNum === 0 ? (
                <p className="mt-1 text-[10px] text-muted">
                  No time logged yet — bar will fill as your team tracks hours.
                </p>
              ) : null}
            </div>
          ) : project.budget_type === 'none' ? (
            <p className="mt-3 text-[10px] italic text-muted">No budget set</p>
          ) : null}
        </div>

        {/* Actions */}
        <div className="shrink-0">
          {canEdit ? (
            <div className="relative">
            <button
              type="button"
              onClick={onToggleMenu}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-text transition hover:bg-slate-100"
              aria-label="Actions"
            >
              Actions
              <ChevronDown className="h-4 w-4 text-muted" />
            </button>
            {isOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
                  {project.is_active ? (
                    <>
                      <button
                        type="button"
                        onClick={onEdit}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-bg"
                      >
                        <Edit3 className="h-4 w-4" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={onPin}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-bg"
                      >
                        <Pin className="h-4 w-4" />
                        {isPinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        type="button"
                        onClick={onDuplicate}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-bg"
                      >
                        <Copy className="h-4 w-4" /> Duplicate
                      </button>
                      <div className="border-t border-slate-100" />
                      <button
                        type="button"
                        onClick={onArchive}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-warning transition hover:bg-warning/10"
                      >
                        <Archive className="h-4 w-4" /> Archive
                      </button>
                      <button
                        type="button"
                        onClick={onDelete}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={onRestore}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-bg"
                      >
                        <RotateCcw className="h-4 w-4" /> Restore
                      </button>
                      <button
                        type="button"
                        onClick={onDelete}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 className="h-4 w-4" /> Delete permanently
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}

function ImportProjectsModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFile = async (f: File) => {
    setFile(f);
    setErrorMsg(null);
    setParsing(true);
    try {
      const text = await f.text();
      const rows = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) =>
          // simple split — full CSV quoting parser is overkill for preview
          line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')),
        );
      setPreview(rows.slice(0, 6));
    } catch (err) {
      setErrorMsg('Could not read this file.');
    } finally {
      setParsing(false);
    }
  };

  const handleSampleDownload = () => {
    const sample =
      'Client,Project,Project Code,Start Date,End Date,Project Notes\n' +
      'Vance Refrigeration,Printer Paper Supply,PRNT-VANCE,01-01-2026,04-03-2026,Keeping their office machines stocked\n' +
      'Vance Refrigeration,High-Gloss Fliers,GLOSS-VANCE,01-01-2026,,Marketing material stock\n';
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-projects.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async () => {
    if (!preview || preview.length < 2) {
      setErrorMsg('No project rows found. Please pick a CSV with at least one project.');
      return;
    }
    // Note: bulk import endpoint isn't wired backend-side yet — we surface a friendly notice.
    setErrorMsg(
      'Preview only — bulk-create is not yet wired to the API. Use “New project” to add one at a time.',
    );
    onImported();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">Import projects</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-text">Create a CSV file with six columns in this order:</p>
          <p className="mt-1 font-mono text-sm font-semibold text-text">
            Client, Project, Project Code, Start Date, End Date, Project Notes
          </p>
          <p className="mt-2 text-xs text-muted">
            All headers are required exactly as written, but only the first two columns need to be
            filled in to import successfully.{' '}
            <button
              type="button"
              onClick={handleSampleDownload}
              className="text-primary hover:underline"
            >
              Download a sample CSV file
            </button>
          </p>

          <div className="mt-4 flex items-center gap-3">
            <label className="btn-outline cursor-pointer">
              <Upload className="h-4 w-4" /> Choose file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
              />
            </label>
            <span className="text-sm text-muted">
              {file ? file.name : 'No file chosen'}
            </span>
          </div>

          {parsing ? (
            <p className="mt-3 text-xs text-muted">Reading file…</p>
          ) : preview ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <div className="bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-muted">
                Preview (first 5 rows)
              </div>
              <div className="max-h-60 overflow-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.map((row, i) => (
                      <tr
                        key={i}
                        className={i === 0 ? 'bg-slate-50/50 font-semibold text-text' : 'border-t border-slate-100 text-text'}
                      >
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-1.5 align-top">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {errorMsg ? (
            <div className="mt-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              {errorMsg}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!preview}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Upload and import projects
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportProjectsModal({
  onClose,
  onExport,
  counts,
}: {
  onClose: () => void;
  onExport: (scope: 'active' | 'budgeted' | 'archived', format: 'csv' | 'excel') => void;
  counts: { active: number; archived: number; budgeted: number };
}) {
  const [scope, setScope] = useState<'active' | 'budgeted' | 'archived'>('active');
  const [format, setFormat] = useState<'csv' | 'excel'>('csv');

  const Option = ({
    value,
    label,
    count,
  }: {
    value: 'active' | 'budgeted' | 'archived';
    label: string;
    count: number;
  }) => {
    const isActive = scope === value;
    return (
      <button
        type="button"
        onClick={() => setScope(value)}
        className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
          isActive
            ? 'border-primary bg-primary-soft text-primary'
            : 'border-slate-200 bg-white text-text hover:bg-slate-50'
        }`}
      >
        {label} ({count})
      </button>
    );
  };

  const FormatOption = ({ value, label }: { value: 'csv' | 'excel'; label: string }) => {
    const isActive = format === value;
    return (
      <button
        type="button"
        onClick={() => setFormat(value)}
        className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
          isActive
            ? 'border-primary bg-primary-soft text-primary'
            : 'border-slate-200 bg-white text-text hover:bg-slate-50'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">Export projects</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">
          <div>
            <p className="mb-2 text-sm font-medium text-text">Which projects would you like to export?</p>
            <div className="flex gap-2">
              <Option value="active" label="Active" count={counts.active} />
              <Option value="budgeted" label="Budgeted" count={counts.budgeted} />
              <Option value="archived" label="Archived" count={counts.archived} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-text">Choose a format:</p>
            <div className="flex gap-2">
              <FormatOption value="csv" label="CSV" />
              <FormatOption value="excel" label="Excel" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button type="button" onClick={() => onExport(scope, format)} className="btn-primary">
            Export projects
          </button>
        </div>
      </div>
    </div>
  );
}
