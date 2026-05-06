import { CheckCircle2, ExternalLink, Loader2, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import SettingsSubnav from '@/components/SettingsSubnav';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  claimJiraConnection,
  disconnectJira,
  getJiraStatus,
  type JiraStatus,
} from '@/api/integrations';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';

interface IntegrationCard {
  key: string;
  name: string;
  category: 'Project management' | 'Communication' | 'Other';
  description: string;
  /** Diamond Jira-blue badge mark — kept inline so we don't add an asset. */
  badge: React.ReactNode;
  available: boolean;
}

const integrationCatalog: IntegrationCard[] = [
  {
    key: 'jira',
    name: 'Jira',
    category: 'Project management',
    description: "Track time right from the issues you're working on in Jira.",
    badge: (
      <span className="flex h-7 w-7 flex-none rotate-45 items-center justify-center rounded-sm bg-[#2684FF] text-white" />
    ),
    available: true,
  },
];

export default function SettingsIntegrationsPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'owner' || user?.role === 'admin';
  const { confirmDialog, ask } = useConfirm();

  const [status, setStatus] = useState<JiraStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [clientKeyInput, setClientKeyInput] = useState('');
  const [showClaim, setShowClaim] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [search, setSearch] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      setStatus(await getJiraStatus());
    } catch (err) {
      setFlash({ kind: 'error', msg: extractApiError(err, 'Could not load Jira status.') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return integrationCatalog;
    return integrationCatalog.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [search]);

  const grouped = useMemo(() => {
    const map = new Map<string, IntegrationCard[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [filtered]);

  const openMarketplace = () => {
    window.open(
      'https://marketplace.atlassian.com/search?product=jira&query=trackflow',
      '_blank',
      'noopener,noreferrer',
    );
  };

  const handleClaim = async () => {
    const key = clientKeyInput.trim();
    if (!key) {
      setFlash({ kind: 'error', msg: 'Paste the clientKey from your install email or server logs.' });
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const next = await claimJiraConnection(key);
      setStatus(next);
      setClientKeyInput('');
      setShowClaim(false);
      setFlash({ kind: 'ok', msg: 'Jira site linked to this workspace.' });
    } catch (err) {
      setFlash({ kind: 'error', msg: extractApiError(err, 'Could not link Jira site.') });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    const ok = await ask({
      title: 'Disconnect Jira?',
      message:
        'New time entries from Jira will stop appearing. Existing entries keep their Jira issue tags.',
      tone: 'danger',
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await disconnectJira();
      setStatus({ connected: false, base_url: null, connected_at: null });
      setFlash({ kind: 'ok', msg: 'Jira disconnected.' });
    } catch (err) {
      setFlash({ kind: 'error', msg: extractApiError(err, 'Could not disconnect Jira.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {confirmDialog}
      <div className="mx-auto flex max-w-6xl">
        <SettingsSubnav />
        <main className="flex-1 px-8 py-8">
          <h1 className="font-heading text-3xl font-bold text-text">Integrations</h1>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              defaultValue="all"
            >
              <option value="all">All integrations</option>
              <option value="connected">Connected</option>
              <option value="available">Available</option>
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {flash ? (
            <div
              className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
                flash.kind === 'ok'
                  ? 'border-accent/30 bg-accent-soft/60 text-accent-dark'
                  : 'border-danger/30 bg-danger/10 text-danger'
              }`}
            >
              {flash.msg}
            </div>
          ) : null}

          {[...grouped.entries()].map(([category, items]) => (
            <section key={category} className="mt-8">
              <h2 className="font-heading text-xl font-bold text-text">{category}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {items.map((item) => (
                  <article
                    key={item.key}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
                  >
                    <div className="flex items-start gap-3">
                      {item.badge}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-heading text-base font-bold text-text">{item.name}</h3>
                          {item.key === 'jira' && status?.connected ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-dark">
                              <CheckCircle2 className="h-3 w-3" />
                              Connected
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-text/80">{item.description}</p>

                        {item.key === 'jira' ? (
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {loading ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                              </span>
                            ) : status?.connected ? (
                              <>
                                <span className="text-xs text-muted">
                                  {status.base_url}
                                </span>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={handleDisconnect}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-danger transition hover:border-danger/40 hover:bg-danger/5 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Disconnect
                                  </button>
                                ) : null}
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={openMarketplace}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-slate-50"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Connect in Jira
                                </button>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => setShowClaim((s) => !s)}
                                    className="text-xs font-semibold text-primary hover:underline"
                                  >
                                    {showClaim ? 'Hide' : 'I already installed it →'}
                                  </button>
                                ) : null}
                              </>
                            )}
                          </div>
                        ) : null}

                        {item.key === 'jira' && !status?.connected && showClaim && canEdit ? (
                          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs text-muted">
                              After installing the TrackFlow app on your Jira site, paste the{' '}
                              <code className="rounded bg-white px-1 py-0.5 font-mono">clientKey</code>{' '}
                              from the install webhook payload below.
                            </p>
                            <label className="mt-3 block">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                                Jira clientKey
                              </span>
                              <input
                                type="text"
                                value={clientKeyInput}
                                onChange={(e) => setClientKeyInput(e.target.value)}
                                placeholder="jira:abc123-def456-…"
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={handleClaim}
                              disabled={busy || !clientKeyInput.trim()}
                              className="btn-primary mt-3 disabled:opacity-50"
                            >
                              {busy ? 'Linking…' : 'Link Jira site'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
