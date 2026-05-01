import { ArrowLeft, Edit3, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getClient } from '@/api/clients';
import { listProjects } from '@/api/projects';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import { formatBudget } from '@/utils/format';
import type { Client, ProjectListItem } from '@/types';

type TabKey = 'active' | 'archived';

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const clientId = id ? Number.parseInt(id, 10) : NaN;
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'owner' || user?.role === 'admin';

  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('active');

  useEffect(() => {
    if (Number.isNaN(clientId)) {
      setError('Invalid client id');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([getClient(clientId), listProjects({ client_id: clientId })])
      .then(([c, p]) => {
        if (cancelled) return;
        setClient(c);
        setProjects(p.results);
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiError(err, 'Failed to load client'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const { active, archived } = useMemo(() => {
    return {
      active: projects.filter((p) => p.is_active),
      archived: projects.filter((p) => !p.is_active),
    };
  }, [projects]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
            Loading client…
          </div>
        </main>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-bg">
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
          <Link
            to="/projects"
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
            {error || 'Client not found'}
          </div>
        </main>
      </div>
    );
  }

  const list = tab === 'active' ? active : archived;

  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          to="/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Client</p>
            <h1 className="mt-1 flex items-center gap-3 font-heading text-3xl font-bold text-text">
              {client.name}
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  client.is_active
                    ? 'bg-accent-soft text-accent-dark'
                    : 'bg-slate-100 text-muted'
                }`}
              >
                {client.is_active ? 'Active' : 'Archived'}
              </span>
            </h1>
            {client.address ? (
              <p className="mt-2 max-w-2xl whitespace-pre-line text-sm text-muted">
                {client.address}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <Link to={`/manage/clients/${client.id}/edit`} className="btn-outline">
                <Edit3 className="h-4 w-4" />
                Edit client
              </Link>
            ) : null}
            {canEdit ? (
              <Link to={`/projects/new?client=${client.id}`} className="btn-primary">
                <Plus className="mr-1 h-4 w-4" />
                New project
              </Link>
            ) : null}
          </div>
        </div>

        {/* Quick facts */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card">
            <p className="text-xs font-medium text-muted">Active projects</p>
            <p className="mt-2 font-heading text-2xl font-bold text-text">{active.length}</p>
          </div>
          <div className="card">
            <p className="text-xs font-medium text-muted">Archived projects</p>
            <p className="mt-2 font-heading text-2xl font-bold text-muted">{archived.length}</p>
          </div>
        </section>

        {/* Tabs: Active / Archived projects */}
        <div className="mb-0 border-b border-slate-200">
          <div className="flex gap-6">
            {(
              [
                { key: 'active' as const, label: `Active projects (${active.length})` },
                { key: 'archived' as const, label: `Archived projects (${archived.length})` },
              ]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTab(opt.key)}
                className={`-mb-px border-b-2 px-1 py-3 text-sm font-semibold transition ${
                  tab === opt.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="py-6">
          {list.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-8 py-12 text-center text-sm text-muted">
              No {tab} projects for this client.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
              <div className="overflow-x-auto">
                <div className="min-w-[560px]">
              <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <div>Project</div>
                <div className="text-right">Budget</div>
                <div className="text-right">Created</div>
              </div>
              {list.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[2fr_1fr_1fr] items-center gap-4 border-b border-slate-100 px-6 py-3 text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      to={`/projects/${p.id}`}
                      className="truncate font-semibold text-text hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.code ? (
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-muted">
                        {p.code}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-right tabular-nums text-text">
                    {formatBudget(p.budget_amount, p.budget_type)}
                  </div>
                  <div className="text-right text-muted">
                    {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
