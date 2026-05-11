import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import ManageSubnav from '@/components/ManageSubnav';
import PageHero from '@/components/PageHero';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  createJobRole,
  deleteJobRole,
  listJobRoles,
  updateJobRole,
} from '@/api/jobRoles';
import { listUsers } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { extractApiError } from '@/utils/errors';
import type { JobRole, User } from '@/types';

export default function ManageRolesPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'owner' || user?.role === 'admin';
  const { confirmDialog, ask } = useConfirm();

  const [roles, setRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JobRole | null>(null);

  const { pending: pendingDelete, scheduleDelete, undo: handleUndoDelete } = useUndoDelete<JobRole>({
    apiDelete: (r) => deleteJobRole(r.id),
    removeFromList: (r) => setRoles((prev) => prev.filter((x) => x.id !== r.id)),
    restoreToList: (r, idx) => setRoles((prev) => {
      const next = [...prev];
      next.splice(idx, 0, r);
      return next;
    }),
    getLabel: (r) => r.name,
    onError: (err) => alert(extractApiError(err, 'Failed to delete role.')),
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listJobRoles()
      .then((data) => {
        if (!cancelled) setRoles(data);
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiError(err, 'Failed to load roles'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(q));
  }, [roles, search]);

  const handleDelete = async (role: JobRole) => {
    const ok = await ask({
      title: `Delete role "${role.name}"?`,
      message:
        role.people_count > 0
          ? `This role is assigned to ${role.people_count} ${role.people_count === 1 ? 'person' : 'people'}. They will be unassigned. You'll have 5 seconds to undo.`
          : "You'll have 5 seconds to undo.",
      confirmLabel: 'Delete role',
      tone: 'danger',
    });
    if (!ok) return;
    const index = roles.findIndex((r) => r.id === role.id);
    scheduleDelete(role, index);
  };

  return (
    <div className="min-h-screen bg-bg">
      <PageHero
        eyebrow="Workspace"
        title="Roles"
        description="Job roles describe people on your team — like Designer, Senior, or NYC. Assign them from the Team page."
      />
      <ManageSubnav />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
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
              New role
            </button>
          ) : null}
          <div className="relative w-full sm:ml-auto sm:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roles…"
              className="input w-full pl-9 sm:w-64"
            />
          </div>
          <span className="text-xs text-muted">
            {filteredRoles.length} {filteredRoles.length === 1 ? 'role' : 'roles'}
          </span>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
            Loading roles…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
            {error}
          </div>
        ) : roles.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-16 text-center shadow-md">
            <p className="text-sm text-muted">
              No roles yet. Create one to start labeling your team.
            </p>
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-16 text-center shadow-md">
            <p className="text-sm text-muted">No roles match &ldquo;{search}&rdquo;.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
            <div className="grid grid-cols-[2fr_1fr_140px] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <div>Role</div>
              <div className="text-right">People</div>
              <div className="text-right">Action</div>
            </div>
            {filteredRoles.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[2fr_1fr_140px] items-center gap-4 border-b border-slate-100 px-6 py-3 text-sm last:border-b-0 hover:bg-slate-50"
              >
                <div className="font-semibold text-text">{r.name}</div>
                <div className="text-right tabular-nums text-text">{r.people_count}</div>
                <div className="flex items-center justify-end gap-2">
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(r);
                          setModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-text transition hover:bg-slate-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
            {pendingDelete ? (
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-6 py-2.5 text-sm">
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
            </div>
          </div>
        )}
      </main>

      {confirmDialog}

      {modalOpen ? (
        <RoleModal
          initial={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={(r) => {
            setRoles((prev) => {
              const idx = prev.findIndex((p) => p.id === r.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = r;
                return next;
              }
              return [...prev, r];
            });
            setModalOpen(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function RoleModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: JobRole | null;
  onClose: () => void;
  onSaved: (r: JobRole) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(initial?.assigned_users?.map((u) => u.id) ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingUsers(true);
    listUsers()
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch(() => {
        // Non-fatal — modal still works for name-only save.
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleUser = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErrMsg('Role name is required.');
      return;
    }
    setSaving(true);
    setErrMsg(null);
    const payload = {
      name: trimmed,
      assigned_user_ids: Array.from(selectedIds),
    };
    try {
      const saved = initial
        ? await updateJobRole(initial.id, payload)
        : await createJobRole(payload);
      onSaved(saved);
    } catch (err) {
      setErrMsg(extractApiError(err, 'Could not save role.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">
            {initial ? 'Edit role' : 'New role'}
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
              <label className="label">Role name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g. Design, Development, Marketing, etc."
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">Who's assigned to this role?</label>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="input pl-9"
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                {loadingUsers ? (
                  <div className="px-3 py-4 text-center text-sm text-muted">Loading users…</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-muted">
                    {userSearch ? 'No users match your search.' : 'No users in this account.'}
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const checked = selectedIds.has(u.id);
                    const initials = (u.full_name || u.email)
                      .split(' ')
                      .map((p) => p[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();
                    return (
                      <label
                        key={u.id}
                        className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 transition hover:bg-slate-50 ${
                          checked ? 'bg-primary-soft/30' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUser(u.id)}
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                          {initials || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-text">{u.full_name || u.email}</div>
                          {u.full_name && u.email !== u.full_name ? (
                            <div className="truncate text-xs text-muted">{u.email}</div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedIds.size > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  {selectedIds.size} {selectedIds.size === 1 ? 'person' : 'people'} selected
                </p>
              ) : null}
            </div>
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
              {saving ? 'Saving…' : initial ? 'Save role' : 'Create role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
