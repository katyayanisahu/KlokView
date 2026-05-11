import {
  Bell,
  CheckCircle2,
  LogIn,
  Clock,
  Info,
  Lock,
  Monitor,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import SettingsLayout from './SettingsLayout';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import {
  getAccountSettings,
  updateAccountSettings,
  type AccountSettings,
} from '@/api/accountSettings';

const SESSION_TIMEOUTS = [
  { v: 30, l: '30 minutes' },
  { v: 60, l: '1 hour' },
  { v: 240, l: '4 hours' },
  { v: 480, l: '8 hours' },
  { v: 1440, l: '1 day' },
  { v: 10080, l: '7 days' },
];

// Mock session list — real backend integration ships when sessions are tracked.
interface MockSession {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current?: boolean;
}

const MOCK_SESSIONS: MockSession[] = [
  {
    id: 'this',
    device: 'LogIn on Windows · this device',
    location: 'Pune, IN',
    lastActive: 'Active now',
    current: true,
  },
  {
    id: 's2',
    device: 'Safari on iPhone',
    location: 'Pune, IN',
    lastActive: '2 hours ago',
  },
  {
    id: 's3',
    device: 'Edge on Windows',
    location: 'Mumbai, IN',
    lastActive: 'Yesterday',
  },
];

export default function SignInSecurityPage() {
  const currentUser = useAuthStore((s) => s.user);
  const canEdit = currentUser?.role === 'owner' || currentUser?.role === 'admin';

  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<keyof AccountSettings | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [sessions, setSessions] = useState<MockSession[]>(MOCK_SESSIONS);

  useEffect(() => {
    let cancelled = false;
    getAccountSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(extractApiError(err, 'Failed to load security settings'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showFlash = (kind: 'ok' | 'error', msg: string) => {
    setFlash({ kind, msg });
    setTimeout(() => setFlash(null), 4000);
  };

  const updateField = async <K extends keyof AccountSettings>(
    field: K,
    value: AccountSettings[K],
  ) => {
    if (!settings || !canEdit) return;
    setSaving(field);
    try {
      const next = await updateAccountSettings({ [field]: value } as Partial<AccountSettings>);
      setSettings(next);
      showFlash('ok', 'Saved.');
    } catch (err) {
      showFlash('error', extractApiError(err, 'Could not save.'));
    } finally {
      setSaving(null);
    }
  };

  const revokeSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    showFlash('ok', 'Session revoked.');
  };

  if (loading) {
    return (
      <SettingsLayout title="Sign in security">
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
          Loading…
        </div>
      </SettingsLayout>
    );
  }

  if (loadError || !settings) {
    return (
      <SettingsLayout title="Sign in security">
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
          {loadError || 'Could not load security settings.'}
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      title="Sign in security"
      description="Account-level security controls for everyone in this workspace."
    >
      <div className="space-y-6">
        {flash ? (
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              flash.kind === 'ok'
                ? 'border-accent/30 bg-accent-soft/60 text-accent-dark'
                : 'border-danger/30 bg-danger/10 text-danger'
            }`}
          >
            {flash.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : null}
            {flash.msg}
          </div>
        ) : null}

        {!canEdit ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Only owners and admins can change security settings.
          </div>
        ) : null}

        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary-soft/40 px-4 py-3 text-xs text-text/80">
          <Info className="mt-0.5 h-4 w-4 flex-none text-primary" />
          <p>
            These flags are persisted on the workspace. Full enforcement (2FA challenge, SSO
            providers, session expiry, login alerts) is wired across multiple releases — toggling a
            switch marks the policy without forcing it yet.
          </p>
        </div>

        {/* 2FA */}
        <Card icon={ShieldCheck} title="Two-factor authentication">
          <Toggle
            label="Require 2FA for everyone"
            description="All teammates must set up an authenticator app (TOTP) on next sign-in."
            on={settings.require_two_factor}
            saving={saving === 'require_two_factor'}
            onChange={(v) => updateField('require_two_factor', v)}
            disabled={!canEdit}
          />
        </Card>

        {/* Google */}
        <Card icon={LogIn} title="Sign in with Google">
          <Toggle
            label="Allow Google sign-in"
            description="Members can sign in with their Google account in addition to email/password."
            on={settings.allow_google_sso}
            saving={saving === 'allow_google_sso'}
            onChange={(v) => updateField('allow_google_sso', v)}
            disabled={!canEdit}
          />
        </Card>

        {/* Microsoft */}
        <Card icon={Lock} title="Sign in with Microsoft">
          <Toggle
            label="Allow Microsoft / Azure AD sign-in"
            description="Useful for Microsoft 365 workspaces. Pairs with the Outlook integration."
            on={settings.allow_microsoft_sso}
            saving={saving === 'allow_microsoft_sso'}
            onChange={(v) => updateField('allow_microsoft_sso', v)}
            disabled={!canEdit}
          />
        </Card>

        {/* Session timeout */}
        <Card icon={Clock} title="Session timeout">
          <div className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-[260px_1fr] sm:items-center sm:gap-4">
            <label htmlFor="session_timeout" className="text-sm font-semibold text-text">
              Auto-sign-out after inactivity
              <span className="mt-0.5 block text-xs font-normal text-muted">
                Members are signed out automatically after this idle period.
              </span>
            </label>
            <select
              id="session_timeout"
              value={settings.session_timeout_minutes}
              onChange={(e) =>
                updateField('session_timeout_minutes', Number.parseInt(e.target.value, 10))
              }
              disabled={!canEdit || saving === 'session_timeout_minutes'}
              className="input max-w-xs"
            >
              {SESSION_TIMEOUTS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Login alerts */}
        <Card icon={Bell} title="Login alerts">
          <Toggle
            label="Email each member on new device sign-in"
            description="Sends a notification when an account signs in from a device or location it has not used before."
            on={settings.login_alerts}
            saving={saving === 'login_alerts'}
            onChange={(v) => updateField('login_alerts', v)}
            disabled={!canEdit}
          />
        </Card>

        {/* Active sessions */}
        <Card icon={Monitor} title="Active sessions">
          <p className="px-5 py-4 text-xs text-muted">
            Devices currently signed in to your account. Revoke any session you don&apos;t recognize.
          </p>
          <ul className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">
                    {s.device}
                    {s.current ? (
                      <span className="ml-2 inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-dark">
                        This device
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {s.location} · {s.lastActive}
                  </p>
                </div>
                {!s.current ? (
                  <button
                    type="button"
                    onClick={() => revokeSession(s.id)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-danger transition hover:border-danger/40 hover:bg-danger/5"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </SettingsLayout>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-heading text-base font-bold text-text">{title}</h2>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Toggle({
  label,
  description,
  on,
  saving,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  on: boolean;
  saving: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        disabled={disabled || saving}
        role="switch"
        aria-checked={on}
        className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition ${
          on ? 'bg-primary' : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${saving ? 'opacity-60' : ''}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            on ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
