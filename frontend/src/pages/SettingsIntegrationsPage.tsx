import { CheckCircle2, ExternalLink, Loader2, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import SettingsLayout from '@/pages/settings/SettingsLayout';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  claimJiraConnection,
  disconnectJira,
  disconnectOutlook,
  getJiraStatus,
  getOutlookStatus,
  startOutlookOAuth,
  type JiraStatus,
  type OutlookStatus,
} from '@/api/integrations';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';

interface IntegrationCard {
  key: 'jira' | 'outlook';
  name: string;
  category: 'Project management' | 'Communication' | 'Other';
  description: string;
  badge: React.ReactNode;
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
  },
  {
    key: 'outlook',
    name: 'Outlook',
    category: 'Communication',
    description:
      'Auto-create time entries from your Outlook calendar events without leaving KlokView.',
    badge: (
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[#0078D4] font-heading text-xs font-bold text-white">
        O
      </span>
    ),
  },
];

type FilterMode = 'all' | 'connected' | 'available';

export default function SettingsIntegrationsPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === 'owner' || user?.role === 'admin';
  const { confirmDialog, ask } = useConfirm();

  const [jira, setJira] = useState<JiraStatus | null>(null);
  const [outlook, setOutlook] = useState<OutlookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | 'jira' | 'outlook'>(null);
  const [clientKeyInput, setClientKeyInput] = useState('');
  const [showClaim, setShowClaim] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const reload = async () => {
    setLoading(true);
    try {
      const [j, o] = await Promise.all([
        getJiraStatus().catch(() => null),
        getOutlookStatus().catch(() => null),
      ]);
      setJira(j);
      setOutlook(o);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const isConnected = (key: IntegrationCard['key']): boolean => {
    if (key === 'jira') return !!jira?.connected;
    if (key === 'outlook') return !!outlook?.connected;
    return false;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return integrationCatalog.filter((i) => {
      if (q && !(i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))) {
        return false;
      }
      if (filterMode === 'connected' && !isConnected(i.key)) return false;
      if (filterMode === 'available' && isConnected(i.key)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterMode, jira, outlook]);

  const showFlash = (kind: 'ok' | 'error', msg: string) => {
    setFlash({ kind, msg });
    setTimeout(() => setFlash(null), 5000);
  };

  // ---- Jira handlers ----

  const openJiraMarketplace = () => {
    window.open(
      'https://marketplace.atlassian.com/search?product=jira&query=klokview',
      '_blank',
      'noopener,noreferrer',
    );
  };

  const handleJiraClaim = async () => {
    const key = clientKeyInput.trim();
    if (!key) {
      showFlash('error', 'Paste the clientKey from your install email or server logs.');
      return;
    }
    setBusy('jira');
    try {
      const next = await claimJiraConnection(key);
      setJira(next);
      setClientKeyInput('');
      setShowClaim(false);
      showFlash('ok', 'Jira site linked to this workspace.');
    } catch (err) {
      showFlash('error', extractApiError(err, 'Could not link Jira site.'));
    } finally {
      setBusy(null);
    }
  };

  const handleJiraDisconnect = async () => {
    const ok = await ask({
      title: 'Disconnect Jira?',
      message:
        'New time entries from Jira will stop appearing. Existing entries keep their Jira issue tags.',
      tone: 'danger',
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    setBusy('jira');
    try {
      await disconnectJira();
      setJira({ connected: false, base_url: null, connected_at: null });
      showFlash('ok', 'Jira disconnected.');
    } catch (err) {
      showFlash('error', extractApiError(err, 'Could not disconnect Jira.'));
    } finally {
      setBusy(null);
    }
  };

  // ---- Outlook handlers ----

  const handleOutlookConnect = async () => {
    setBusy('outlook');
    try {
      const { authorize_url } = await startOutlookOAuth();
      window.location.href = authorize_url;
    } catch (err) {
      showFlash('error', extractApiError(err, 'Could not start Microsoft sign-in.'));
      setBusy(null);
    }
  };

  const handleOutlookDisconnect = async () => {
    const ok = await ask({
      title: 'Disconnect Outlook?',
      message:
        'KlokView will stop reading your calendar events. Existing time entries created from Outlook are kept.',
      tone: 'danger',
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    setBusy('outlook');
    try {
      await disconnectOutlook();
      setOutlook((prev) =>
        prev ? { ...prev, connected: false, email: null, connected_at: null } : null,
      );
      showFlash('ok', 'Outlook disconnected.');
    } catch (err) {
      showFlash('error', extractApiError(err, 'Could not disconnect Outlook.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsLayout
      title="Integrations"
      description="Connect KlokView to the tools your team already uses."
    >
      {confirmDialog}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            className="input w-auto py-2"
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
            className={`rounded-lg border px-4 py-3 text-sm ${
              flash.kind === 'ok'
                ? 'border-accent/30 bg-accent-soft/60 text-accent-dark'
                : 'border-danger/30 bg-danger/10 text-danger'
            }`}
          >
            {flash.msg}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-muted">
            No integrations match the current filter.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((item) => {
              const connected = isConnected(item.key);
              return (
                <article
                  key={item.key}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    {item.badge}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-heading text-base font-bold text-text">{item.name}</h3>
                          <span className="inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            {item.category}
                          </span>
                        </div>
                        {connected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-dark">
                            <CheckCircle2 className="h-3 w-3" />
                            Connected
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-text/80">{item.description}</p>

                      {/* JIRA actions */}
                      {item.key === 'jira' ? (
                        <JiraActions
                          status={jira}
                          busy={busy === 'jira'}
                          canEdit={canEdit}
                          showClaim={showClaim}
                          clientKeyInput={clientKeyInput}
                          setClientKeyInput={setClientKeyInput}
                          onToggleClaim={() => setShowClaim((s) => !s)}
                          onMarketplace={openJiraMarketplace}
                          onClaim={handleJiraClaim}
                          onDisconnect={handleJiraDisconnect}
                        />
                      ) : null}

                      {/* OUTLOOK actions */}
                      {item.key === 'outlook' ? (
                        <OutlookActions
                          status={outlook}
                          busy={busy === 'outlook'}
                          canEdit={canEdit}
                          onConnect={handleOutlookConnect}
                          onDisconnect={handleOutlookDisconnect}
                        />
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}

function JiraActions({
  status,
  busy,
  canEdit,
  showClaim,
  clientKeyInput,
  setClientKeyInput,
  onToggleClaim,
  onMarketplace,
  onClaim,
  onDisconnect,
}: {
  status: JiraStatus | null;
  busy: boolean;
  canEdit: boolean;
  showClaim: boolean;
  clientKeyInput: string;
  setClientKeyInput: (v: string) => void;
  onToggleClaim: () => void;
  onMarketplace: () => void;
  onClaim: () => void;
  onDisconnect: () => void;
}) {
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {status?.connected ? (
          <>
            <span className="text-xs text-muted">{status.base_url}</span>
            {canEdit ? (
              <button
                type="button"
                onClick={onDisconnect}
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
              onClick={onMarketplace}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Connect in Jira
            </button>
            {canEdit ? (
              <button
                type="button"
                onClick={onToggleClaim}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {showClaim ? 'Hide' : 'I already installed it →'}
              </button>
            ) : null}
          </>
        )}
      </div>

      {!status?.connected && showClaim && canEdit ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-muted">
            After installing the KlokView app on your Jira site, paste the{' '}
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
            onClick={onClaim}
            disabled={busy || !clientKeyInput.trim()}
            className="btn-primary mt-3 disabled:opacity-50"
          >
            {busy ? 'Linking…' : 'Link Jira site'}
          </button>
        </div>
      ) : null}
    </>
  );
}

function OutlookActions({
  status,
  busy,
  canEdit,
  onConnect,
  onDisconnect,
}: {
  status: OutlookStatus | null;
  busy: boolean;
  canEdit: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!status) return null;

  if (!status.configured) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Microsoft OAuth not configured on this server. Set <code className="font-mono">MS_CLIENT_ID</code>,{' '}
        <code className="font-mono">MS_CLIENT_SECRET</code>, and{' '}
        <code className="font-mono">MS_REDIRECT_URI</code> in the backend{' '}
        <code className="font-mono">.env</code> to enable Outlook.
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {status.connected ? (
        <>
          {status.email ? <span className="text-xs text-muted">{status.email}</span> : null}
          {canEdit ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-danger transition hover:border-danger/40 hover:bg-danger/5 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Disconnect
            </button>
          ) : null}
        </>
      ) : (
        canEdit && (
          <button
            type="button"
            onClick={onConnect}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            Connect with Microsoft
          </button>
        )
      )}
    </div>
  );
}
