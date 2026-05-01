import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import ManageSubnav from '@/components/ManageSubnav';
import PageHero from '@/components/PageHero';
import { getClient, updateClient } from '@/api/clients';
import { extractApiError } from '@/utils/errors';
import type { Client } from '@/types';

export default function EditClientPage() {
  const { id } = useParams<{ id: string }>();
  const clientId = id ? Number.parseInt(id, 10) : NaN;
  const navigate = useNavigate();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(clientId)) {
      setError('Invalid client id');
      setLoading(false);
      return;
    }
    getClient(clientId)
      .then((c) => {
        setClient(c);
        setName(c.name);
        setAddress(c.address);
      })
      .catch((err) => setError(extractApiError(err, 'Failed to load client')))
      .finally(() => setLoading(false));
  }, [clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setServerError(null);
    try {
      await updateClient(clientId, {
        name: name.trim(),
        address: address.trim(),
      });
      navigate('/manage/clients');
    } catch (err) {
      setServerError(extractApiError(err, 'Could not save client.'));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <PageHero eyebrow="Workspace" title="Edit client" />
        <ManageSubnav />
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
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
        <PageHero eyebrow="Workspace" title="Edit client" />
        <ManageSubnav />
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Link
            to="/manage/clients"
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Clients
          </Link>
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
            {error || 'Client not found'}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <PageHero
        eyebrow="Workspace"
        title="Edit client"
        description={client.name}
      />
      <ManageSubnav />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          to="/manage/clients"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <form onSubmit={handleSubmit} className="card">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-[140px_1fr]">
              <label htmlFor="name" className="text-sm font-medium text-text sm:pt-2 sm:text-right">
                Client name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                required
              />

              <label htmlFor="address" className="text-sm font-medium text-text sm:pt-2 sm:text-right">
                Address
              </label>
              <textarea
                id="address"
                rows={4}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="input resize-none"
              />

            </div>

            {serverError ? (
              <div className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {serverError}
              </div>
            ) : null}

            <div className="mt-6 flex items-center gap-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save client'}
              </button>
              <Link to="/manage/clients" className="btn-outline">
                Cancel
              </Link>
            </div>
          </form>

          <aside className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary-soft/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Active projects
              </p>
              <p className="mt-1 text-sm text-text">
                {client.active_project_count === 0
                  ? 'No active projects for this client.'
                  : `${client.active_project_count} active project${client.active_project_count === 1 ? '' : 's'}`}
              </p>
            </div>
            {client.active_project_count > 0 ? (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-xs text-text">
                You cannot archive &ldquo;{client.name}&rdquo; because it has active projects.
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}
