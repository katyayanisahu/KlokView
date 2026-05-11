import { useEffect, useState } from 'react';
import { Clock, Image as ImageIcon, UserCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import ProfileLayout from './ProfileLayout';
import { getMyProfile, updateMyProfile } from '@/api/profile';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import { useDefaultCapacityHours } from '@/utils/preferences';
import type { MyProfile, MyProfileUpdatePayload } from '@/types';

const TIMEZONES = [
  { value: '', label: 'Use workspace timezone' },
  { value: 'Asia/Kolkata', label: '(GMT+05:30) Kolkata' },
  { value: 'Asia/Dubai', label: '(GMT+04:00) Dubai' },
  { value: 'Asia/Singapore', label: '(GMT+08:00) Singapore' },
  { value: 'Asia/Tokyo', label: '(GMT+09:00) Tokyo' },
  { value: 'Europe/London', label: '(GMT+00:00) London' },
  { value: 'Europe/Berlin', label: '(GMT+01:00) Berlin' },
  { value: 'America/New_York', label: '(GMT-05:00) New York' },
  { value: 'America/Chicago', label: '(GMT-06:00) Chicago' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) Los Angeles' },
  { value: 'Australia/Sydney', label: '(GMT+10:00) Sydney' },
  { value: 'UTC', label: 'UTC' },
];

const CAPACITY_OPTIONS = [20, 25, 30, 35, 40, 45, 50];

const NAME_RE = /^[\p{L}][\p{L}\s'’\-]*$/u;

export default function BasicInfoTab() {
  const refreshAuthUser = useAuthStore((s) => s.hydrate);
  const defaultCapacity = useDefaultCapacityHours();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [capacity, setCapacity] = useState(defaultCapacity);
  const [timezone, setTimezone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setFirstName(p.first_name);
        setLastName(p.last_name);
        setEmployeeId(p.employee_id);
        setCapacity(String(p.weekly_capacity_hours ?? defaultCapacity));
        setTimezone(p.timezone ?? '');
        setAvatarUrl(p.avatar_url ?? '');
      })
      .catch((e) => setError(extractApiError(e)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function validate(): string | null {
    if (firstName && !NAME_RE.test(firstName.trim())) {
      return 'First name can only contain letters, spaces, hyphens, and apostrophes.';
    }
    if (lastName && !NAME_RE.test(lastName.trim())) {
      return 'Last name can only contain letters, spaces, hyphens, and apostrophes.';
    }
    const cap = Number.parseFloat(capacity);
    if (Number.isNaN(cap) || cap < 0 || cap > 168) {
      return 'Capacity must be between 0 and 168 hours per week.';
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const payload: MyProfileUpdatePayload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      employee_id: employeeId.trim(),
      weekly_capacity_hours: capacity,
      timezone,
      avatar_url: avatarUrl.trim(),
    };

    setSaving(true);
    try {
      const updated = await updateMyProfile(payload);
      setProfile(updated);
      setSuccess(true);
      void refreshAuthUser();
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (!profile) return;
    setFirstName(profile.first_name);
    setLastName(profile.last_name);
    setEmployeeId(profile.employee_id);
    setCapacity(String(profile.weekly_capacity_hours ?? defaultCapacity));
    setTimezone(profile.timezone ?? '');
    setAvatarUrl(profile.avatar_url ?? '');
    setError(null);
    setSuccess(false);
  }

  return (
    <ProfileLayout title="Your basic info" profile={profile}>
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-muted shadow-sm">
          Loading…
        </div>
      ) : (
        <form onSubmit={onSubmit} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {error ? (
            <div className="m-6 mb-0 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="m-6 mb-0 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-dark">
              Profile updated.
            </div>
          ) : null}

          {/* IDENTITY */}
          <Section icon={UserCircle2} title="Identity" subtitle="How you appear across KlokView.">
            <Field label="First name">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input"
                autoComplete="given-name"
              />
            </Field>
            <Field label="Last name">
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input"
                autoComplete="family-name"
              />
            </Field>
            <Field label="Work email" help="Contact your administrator to change your email address.">
              <input
                type="email"
                value={profile?.email ?? ''}
                readOnly
                className="input cursor-not-allowed bg-slate-50 text-muted"
              />
            </Field>
            <Field
              label="Employee ID"
              help="Optional. A unique identifier for this employee within your organization."
            >
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="input"
              />
            </Field>
            <Field
              label="Roles"
              help={
                profile?.job_role_names && profile.job_role_names.length > 0
                  ? undefined
                  : 'No job roles assigned. Ask an admin to add you to a role under Manage › Roles.'
              }
            >
              {profile?.job_role_names && profile.job_role_names.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {profile.job_role_names.map((name) => (
                    <span
                      key={name}
                      className="inline-flex rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  disabled
                  placeholder="No job roles assigned"
                  className="input cursor-not-allowed bg-slate-50 text-muted"
                />
              )}
            </Field>
          </Section>

          {/* WORK DETAILS */}
          <Section
            icon={Clock}
            title="Work details"
            subtitle="Your weekly availability and home timezone."
          >
            <Field label="Capacity" help="The number of hours per week you are available to work.">
              <div className="flex items-center gap-2">
                <select
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="input w-auto"
                >
                  {CAPACITY_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {h}{h === 35 ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-muted">hours per week</span>
              </div>
            </Field>
            <Field label="Timezone">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="input"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value || 'workspace'} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              {profile?.account_timezone && !timezone ? (
                <p className="mt-1 text-xs text-muted">
                  Workspace timezone: {profile.account_timezone}.
                </p>
              ) : null}
            </Field>
          </Section>

          {/* DISPLAY */}
          <Section
            icon={ImageIcon}
            title="Display"
            subtitle="Your photo and dashboard preferences."
            isLast
          >
            <Field label="Photo">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary-dark font-heading text-lg font-bold text-white shadow-sm ring-4 ring-white">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    ((profile?.full_name?.[0] ?? profile?.email?.[0]) ?? 'U').toUpperCase()
                  )}
                </div>
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-muted"
                  title="Photo upload is not yet available"
                >
                  Upload photo · coming soon
                </button>
              </div>
            </Field>
          </Section>

          {/* Sticky action bar */}
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
            <button type="button" onClick={onCancel} className="btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Update info'}
            </button>
          </div>
        </form>
      )}
    </ProfileLayout>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  isLast,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`px-6 py-6 ${isLast ? '' : 'border-b border-slate-100'}`}>
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="font-heading text-base font-bold text-text">{title}</h2>
          {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
        </div>
      </div>
      <div className="space-y-4 sm:pl-12">{children}</div>
    </section>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-4">
      <label className="text-sm font-medium text-text">{label}</label>
      <div>
        {children}
        {help ? <p className="mt-1 text-xs text-muted">{help}</p> : null}
      </div>
    </div>
  );
}
