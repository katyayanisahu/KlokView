import {
  BarChart3,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Mail,
  Pencil,
  Plug,
  Users,
  X as XIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import SettingsLayout from './SettingsLayout';
import { useAuthStore } from '@/store/authStore';
import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import { extractApiError } from '@/utils/errors';
import {
  getAccountSettings,
  updateAccountSettings,
  type ModuleFlags,
} from '@/api/accountSettings';

interface ModuleDef {
  key: keyof ModuleFlags;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  locked?: boolean;
  defaultOn?: boolean;
}

const MODULES: ModuleDef[] = [
  {
    key: 'time_tracking',
    label: 'Time tracking',
    description: 'Core feature. Members log time against projects and tasks.',
    icon: Clock,
    locked: true,
    defaultOn: true,
  },
  {
    key: 'team',
    label: 'Team',
    description: 'Add and manage teammates, set capacity, assign roles.',
    icon: Users,
    locked: true,
    defaultOn: true,
  },
  {
    key: 'timesheet_approval',
    label: 'Timesheet approval',
    description: 'Members submit weekly timesheets; managers approve and lock entries.',
    icon: ClipboardList,
    defaultOn: true,
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'Time, profitability, detailed time, and activity log reports.',
    icon: BarChart3,
    defaultOn: true,
  },
  {
    key: 'activity_log',
    label: 'Activity log',
    description: 'Chronological feed of who did what across the workspace.',
    icon: CalendarCheck,
    defaultOn: true,
  },
  {
    key: 'jira_sync',
    label: 'Jira integration',
    description: 'Track time against Jira issues, with two-way sync of worklogs.',
    icon: Plug,
    defaultOn: false,
  },
  {
    key: 'outlook_sync',
    label: 'Outlook integration',
    description: 'Auto-create time entries from Outlook calendar events.',
    icon: Mail,
    defaultOn: false,
  },
];

function isOn(flags: ModuleFlags | undefined, key: keyof ModuleFlags, def: boolean): boolean {
  if (!flags || flags[key] === undefined) return def;
  return !!flags[key];
}

export default function ModulesPage() {
  const currentUser = useAuthStore((s) => s.user);
  const canEdit = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const setStoreSettings = useAccountSettingsStore((s) => s.setSettings);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  // Saved + draft copies — saved is the source of truth in view mode, draft is what the user edits.
  const [saved, setSaved] = useState<ModuleFlags>({});
  const [draft, setDraft] = useState<ModuleFlags>({});

  useEffect(() => {
    let cancelled = false;
    getAccountSettings()
      .then((s) => {
        if (cancelled) return;
        setSaved({ ...s.enabled_modules });
        setDraft({ ...s.enabled_modules });
        setStoreSettings(s);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(extractApiError(err, 'Failed to load modules'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setStoreSettings]);

  const toggle = (key: keyof ModuleFlags, locked: boolean) => {
    if (locked || !canEdit) return;
    const def = MODULES.find((m) => m.key === key)?.defaultOn ?? false;
    const current = isOn(draft, key, def);
    setDraft({ ...draft, [key]: !current });
  };

  const handleEdit = () => {
    if (!canEdit) return;
    setMode('edit');
    setFlash(null);
  };

  const handleCancel = () => {
    setDraft({ ...saved });
    setMode('view');
    setFlash(null);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setFlash(null);
    try {
      const next = await updateAccountSettings({ enabled_modules: draft });
      setSaved({ ...next.enabled_modules });
      setDraft({ ...next.enabled_modules });
      setStoreSettings(next);
      setMode('view');
      setFlash({ kind: 'ok', msg: 'Modules saved.' });
    } catch (err) {
      setFlash({ kind: 'error', msg: extractApiError(err, 'Could not save modules.') });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 4000);
    }
  };

  if (loading) {
    return (
      <SettingsLayout title="Modules">
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
          Loading…
        </div>
      </SettingsLayout>
    );
  }

  if (loadError) {
    return (
      <SettingsLayout title="Modules">
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
          {loadError}
        </div>
      </SettingsLayout>
    );
  }

  // In view mode read from `saved`, in edit mode read from `draft`.
  const flagsForRender = mode === 'edit' ? draft : saved;

  return (
    <SettingsLayout
      title="Modules"
      description="Enable only the features your team uses. Hidden modules disappear from navigation and their endpoints are blocked."
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
            Only owners and admins can change which modules are enabled.
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {MODULES.map((m) => {
              const on = isOn(flagsForRender, m.key, m.defaultOn ?? false);
              const lockedToggle = m.locked || !canEdit;
              return (
                <li
                  key={m.key}
                  className="flex items-start gap-4 px-5 py-4 transition hover:bg-slate-50/40"
                >
                  <span
                    className={`inline-flex h-10 w-10 flex-none items-center justify-center rounded-lg ${
                      on ? 'bg-primary-soft text-primary' : 'bg-slate-100 text-muted'
                    }`}
                  >
                    <m.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-sm font-bold text-text">{m.label}</h3>
                      {m.locked ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-muted">
                          Always on
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{m.description}</p>
                  </div>

                  {mode === 'edit' ? (
                    <button
                      type="button"
                      onClick={() => toggle(m.key, !!m.locked)}
                      disabled={lockedToggle}
                      role="switch"
                      aria-checked={on}
                      className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition ${
                        on ? 'bg-primary' : 'bg-slate-300'
                      } ${lockedToggle ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          on ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  ) : (
                    <span
                      className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-full ${
                        on
                          ? 'bg-accent-soft text-accent-dark'
                          : 'bg-slate-100 text-muted'
                      }`}
                      aria-label={on ? 'Enabled' : 'Disabled'}
                    >
                      {on ? <Check className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {mode === 'edit' ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save modules'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="btn-outline disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : canEdit ? (
          <div>
            <button
              type="button"
              onClick={handleEdit}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Pencil className="h-4 w-4" />
              Edit modules
            </button>
          </div>
        ) : null}
      </div>
    </SettingsLayout>
  );
}
