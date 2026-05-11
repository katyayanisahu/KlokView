import { useEffect, useState } from 'react';

import ProfileLayout from './ProfileLayout';
import { getMyNotifications, updateMyNotifications } from '@/api/profile';
import { extractApiError } from '@/utils/errors';
import type { NotificationPrefs } from '@/types';

const DEFAULT_PREFS: NotificationPrefs = {
  reminder_personal_daily: false,
  reminder_team_wide: true,
  weekly_email: true,
  approval_email_people: true,
  approval_email_projects: true,
  approval_email_approved: false,
  project_deleted_email: false,
  product_updates_email: true,
};

export default function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [originalPrefs, setOriginalPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyNotifications()
      .then((p) => {
        if (cancelled) return;
        setPrefs(p);
        setOriginalPrefs(p);
      })
      .catch((e) => setError(extractApiError(e)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function set<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSuccess(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const updated = await updateMyNotifications(prefs);
      setPrefs(updated);
      setOriginalPrefs(updated);
      setSuccess(true);
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    setPrefs(originalPrefs);
    setError(null);
    setSuccess(false);
  }

  const isDirty = (Object.keys(prefs) as Array<keyof NotificationPrefs>).some(
    (k) => prefs[k] !== originalPrefs[k],
  );

  return (
    <ProfileLayout title="Notifications">
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">
          Loading…
        </div>
      ) : (
        <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6">
          {error ? (
            <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="mb-4 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-dark">
              Notification preferences saved.
            </div>
          ) : null}

          <Section label="Timesheet reminders">
            <Check
              label="Help me track my time with daily personal reminders"
              checked={prefs.reminder_personal_daily}
              onChange={(v) => set('reminder_personal_daily', v)}
              disabled
              comingSoon
            />
            <Check
              label="Include me in automatic team-wide reminders"
              checked={prefs.reminder_team_wide}
              onChange={(v) => set('reminder_team_wide', v)}
              disabled
              comingSoon
            />
          </Section>

          <Section label="Your weekly KlokView">
            <Check
              label="Email me a weekly report of my time"
              checked={prefs.weekly_email}
              onChange={(v) => set('weekly_email', v)}
              disabled
              comingSoon
            />
          </Section>

          <Section label="Approval">
            <Check
              label="Email me if timesheets are submitted for people I manage"
              checked={prefs.approval_email_people}
              onChange={(v) => set('approval_email_people', v)}
            />
            <Check
              label="Email me if timesheets are submitted for projects I manage"
              checked={prefs.approval_email_projects}
              onChange={(v) => set('approval_email_projects', v)}
            />
            <Check
              label="Email me when a timesheet is approved"
              checked={prefs.approval_email_approved}
              onChange={(v) => set('approval_email_approved', v)}
            />
          </Section>

          <Section label="Other notifications">
            <Check
              label="Email me if any project is deleted"
              checked={prefs.project_deleted_email}
              onChange={(v) => set('project_deleted_email', v)}
            />
            <Check
              label="Email me occasional updates, offers, tips, and interesting stories"
              checked={prefs.product_updates_email}
              onChange={(v) => set('product_updates_email', v)}
              disabled
              comingSoon
            />
          </Section>

          <div className="flex items-center gap-2 pt-4">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Update notifications'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={!isDirty || saving}
              className="btn-outline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </ProfileLayout>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-slate-100 py-4 first:pt-0 last:border-b-0 sm:grid-cols-[200px_1fr]">
      <p className="text-sm font-medium text-text">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled = false,
  comingSoon = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2 text-sm ${
        disabled ? 'cursor-not-allowed text-muted' : 'text-text'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="flex flex-wrap items-center gap-2">
        <span>{label}</span>
        {comingSoon ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-muted">
            Coming soon
          </span>
        ) : null}
      </span>
    </label>
  );
}
