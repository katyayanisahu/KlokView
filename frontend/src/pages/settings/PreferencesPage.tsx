import { Building2, CheckCircle2, Clock, Globe2, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';

import SettingsLayout from './SettingsLayout';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import {
  getAccountSettings,
  updateAccountSettings,
  type AccountSettings,
  type AccountSettingsUpdate,
} from '@/api/accountSettings';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CURRENCIES = [
  { code: 'INR', label: 'Indian Rupee – INR (₹)' },
  { code: 'USD', label: 'US Dollar – USD ($)' },
  { code: 'EUR', label: 'Euro – EUR (€)' },
  { code: 'GBP', label: 'British Pound – GBP (£)' },
  { code: 'AUD', label: 'Australian Dollar – AUD (A$)' },
  { code: 'AED', label: 'UAE Dirham – AED (د.إ)' },
  { code: 'SGD', label: 'Singapore Dollar – SGD (S$)' },
];

const NUMBER_FORMATS = ['1,234.56', '1.234,56', '1 234,56'];

export default function PreferencesPage() {
  const currentUser = useAuthStore((s) => s.user);
  const canEdit = currentUser?.role === 'owner' || currentUser?.role === 'admin';

  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  // Editable form state, mirrored from `settings`
  const [companyName, setCompanyName] = useState('');
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [fiscalMonth, setFiscalMonth] = useState(1);
  const [weekStart, setWeekStart] = useState<'monday' | 'sunday'>('monday');
  const [capacity, setCapacity] = useState('35');
  const [deadline, setDeadline] = useState('');
  const [dateFormat, setDateFormat] = useState<AccountSettings['date_format']>('DD/MM/YYYY');
  const [timeFormat, setTimeFormat] = useState<AccountSettings['time_format']>('12h');
  const [timeDisplay, setTimeDisplay] = useState<AccountSettings['time_display']>('hh_mm');
  const [timerMode, setTimerMode] = useState<AccountSettings['timer_mode']>('duration');
  const [currency, setCurrency] = useState('INR');
  const [numberFormat, setNumberFormat] = useState('1,234.56');

  const hydrate = (s: AccountSettings) => {
    setSettings(s);
    setCompanyName(s.name);
    setOwnerId(s.owner ?? null);
    setTimezone(s.timezone);
    setFiscalMonth(s.fiscal_year_start_month);
    setWeekStart(s.week_starts_on);
    setCapacity(String(s.default_capacity_hours));
    setDeadline(s.timesheet_deadline);
    setDateFormat(s.date_format);
    setTimeFormat(s.time_format);
    setTimeDisplay(s.time_display);
    setTimerMode(s.timer_mode);
    setCurrency(s.currency);
    setNumberFormat(s.number_format);
  };

  useEffect(() => {
    let cancelled = false;
    getAccountSettings()
      .then((s) => {
        if (!cancelled) hydrate(s);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(extractApiError(err, 'Failed to load preferences'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const cap = Number.parseFloat(capacity);
    if (Number.isNaN(cap) || cap <= 0 || cap > 168) {
      setFlash({ kind: 'error', msg: 'Default capacity must be between 1 and 168 hours.' });
      return;
    }
    setSaving(true);
    setFlash(null);
    try {
      const payload: AccountSettingsUpdate = {
        name: companyName.trim() || 'Workspace',
        owner: ownerId,
        timezone,
        fiscal_year_start_month: fiscalMonth,
        week_starts_on: weekStart,
        default_capacity_hours: capacity,
        timesheet_deadline: deadline.trim(),
        date_format: dateFormat,
        time_format: timeFormat,
        time_display: timeDisplay,
        timer_mode: timerMode,
        currency,
        number_format: numberFormat,
      };
      const next = await updateAccountSettings(payload);
      hydrate(next);
      setMode('view');
      setFlash({ kind: 'ok', msg: 'Preferences saved.' });
    } catch (err) {
      setFlash({ kind: 'error', msg: extractApiError(err, 'Could not save preferences.') });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 4000);
    }
  };

  const handleCancel = () => {
    if (settings) hydrate(settings); // discard unsaved edits
    setMode('view');
    setFlash(null);
  };

  const handleEdit = () => {
    if (!canEdit) return;
    setMode('edit');
    setFlash(null);
  };

  if (loading) {
    return (
      <SettingsLayout title="Preferences">
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
          Loading…
        </div>
      </SettingsLayout>
    );
  }

  if (loadError) {
    return (
      <SettingsLayout title="Preferences">
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
          {loadError}
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      title="Preferences"
      description="Workspace defaults for time tracking, formats, and currency."
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
            Only owners and admins can edit workspace preferences.
          </div>
        ) : null}

        {mode === 'view' ? (
          <div className="space-y-6">
            <Card icon={Building2} title="Company info">
              <Field label="Company name">
                <ReadValue>{companyName || '—'}</ReadValue>
              </Field>
              <Field label="Account owner">
                <ReadValue>
                  {(() => {
                    const match = settings?.eligible_owners.find((u) => u.id === ownerId);
                    if (match) {
                      return (
                        <>
                          {match.full_name}
                          <span className="ml-2 text-xs text-muted">{match.email}</span>
                        </>
                      );
                    }
                    return (
                      <>
                        {settings?.owner_name || settings?.owner_email || '—'}
                        {settings?.owner_email ? (
                          <span className="ml-2 text-xs text-muted">{settings.owner_email}</span>
                        ) : null}
                      </>
                    );
                  })()}
                </ReadValue>
              </Field>
            </Card>

            <Card icon={Clock} title="Time tracking defaults">
              <Field label="Timezone">
                <ReadValue>{timezone}</ReadValue>
              </Field>
              <Field label="Fiscal year">
                <ReadValue>Starts in {MONTHS[fiscalMonth - 1] ?? '—'}</ReadValue>
              </Field>
              <Field label="Start week on">
                <ReadValue>{weekStart === 'monday' ? 'Monday' : 'Sunday'}</ReadValue>
              </Field>
              <Field label="Default capacity">
                <ReadValue>{capacity} hours per week</ReadValue>
              </Field>
              <Field label="Timesheet deadline">
                <ReadValue>{deadline || <span className="text-muted">Not set</span>}</ReadValue>
              </Field>
              <Field label="Timer mode">
                <ReadValue>
                  {timerMode === 'duration'
                    ? 'Track via duration'
                    : 'Track via start & end'}
                </ReadValue>
              </Field>
            </Card>

            <Card icon={Globe2} title="Display & formats">
              <Field label="Date format">
                <ReadValue>{dateFormat}</ReadValue>
              </Field>
              <Field label="Time format">
                <ReadValue>{timeFormat === '12h' ? '12-hour clock' : '24-hour clock'}</ReadValue>
              </Field>
              <Field label="Time display">
                <ReadValue>
                  {timeDisplay === 'hh_mm' ? 'HH:MM (e.g. 1:30)' : 'Decimal (e.g. 1.50)'}
                </ReadValue>
              </Field>
              <Field label="Currency">
                <ReadValue>
                  {CURRENCIES.find((c) => c.code === currency)?.label ?? currency}
                </ReadValue>
              </Field>
              <Field label="Number format">
                <ReadValue>{numberFormat}</ReadValue>
              </Field>
            </Card>

            {canEdit ? (
              <div>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Edit preferences
                </button>
              </div>
            ) : null}
          </div>
        ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Company info */}
          <Card icon={Building2} title="Company info">
            <Field label="Company name" htmlFor="company_name">
              <input
                id="company_name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={!canEdit}
                className="input"
                required
              />
            </Field>
            <Field
              label="Account owner"
              htmlFor="account_owner"
              hint="Only Owners and Administrators can be set as the Account Owner."
            >
              <select
                id="account_owner"
                value={ownerId ?? ''}
                onChange={(e) =>
                  setOwnerId(e.target.value ? Number.parseInt(e.target.value, 10) : null)
                }
                disabled={!canEdit}
                className="input"
              >
                {(settings?.eligible_owners ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
                {/* If the current owner is not in eligible list (stale FK), show them too */}
                {settings?.owner &&
                !settings.eligible_owners.some((u) => u.id === settings.owner) ? (
                  <option value={settings.owner}>
                    {settings.owner_name || settings.owner_email} (current)
                  </option>
                ) : null}
              </select>
            </Field>
          </Card>

          {/* Time tracking defaults */}
          <Card icon={Clock} title="Time tracking defaults">
            <Field label="Timezone" htmlFor="timezone">
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={!canEdit}
                className="input"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fiscal year starts" htmlFor="fiscal_month">
              <select
                id="fiscal_month"
                value={fiscalMonth}
                onChange={(e) => setFiscalMonth(Number.parseInt(e.target.value, 10))}
                disabled={!canEdit}
                className="input"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start week on">
              <div className="flex gap-2">
                {(['monday', 'sunday'] as const).map((opt) => (
                  <label
                    key={opt}
                    className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition ${
                      weekStart === opt
                        ? 'border-primary bg-primary-soft/60 text-primary'
                        : 'border-slate-200 bg-white text-text hover:border-slate-300'
                    } ${!canEdit ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <input
                      type="radio"
                      name="week_start"
                      value={opt}
                      checked={weekStart === opt}
                      onChange={() => setWeekStart(opt)}
                      className="sr-only"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Default capacity" htmlFor="capacity" hint="Used by utilization reports.">
              <div className="flex items-center gap-2">
                <input
                  id="capacity"
                  type="number"
                  min={1}
                  max={168}
                  step={0.5}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  disabled={!canEdit}
                  className="input w-32"
                />
                <span className="text-sm text-muted">hours per week</span>
              </div>
            </Field>
            <Field
              label="Timesheet deadline"
              htmlFor="deadline"
              hint="Used for reminder copy. Free-form, e.g. “Friday at 5:00pm”."
            >
              <input
                id="deadline"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={!canEdit}
                placeholder="Friday at 5:00pm"
                className="input"
              />
            </Field>
            <Field label="Timer mode">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { v: 'duration' as const, l: 'Track via duration', d: 'Type how long you spent.' },
                  { v: 'start_end' as const, l: 'Track via start & end', d: 'Pick start and end times.' },
                ].map((opt) => {
                  const selected = timerMode === opt.v;
                  return (
                    <label
                      key={opt.v}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                        selected
                          ? 'border-primary bg-primary-soft/40'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      } ${!canEdit ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      <input
                        type="radio"
                        name="timer_mode"
                        checked={selected}
                        onChange={() => setTimerMode(opt.v)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-text">{opt.l}</span>
                        <span className="text-xs text-muted">{opt.d}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>
          </Card>

          {/* Display formats */}
          <Card icon={Globe2} title="Display & formats">
            <Field label="Date format" htmlFor="date_format">
              <select
                id="date_format"
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as AccountSettings['date_format'])}
                disabled={!canEdit}
                className="input"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </Field>
            <Field label="Time format" htmlFor="time_format">
              <select
                id="time_format"
                value={timeFormat}
                onChange={(e) => setTimeFormat(e.target.value as AccountSettings['time_format'])}
                disabled={!canEdit}
                className="input"
              >
                <option value="12h">12-hour clock</option>
                <option value="24h">24-hour clock</option>
              </select>
            </Field>
            <Field label="Time display" htmlFor="time_display" hint="How tracked hours look in lists.">
              <select
                id="time_display"
                value={timeDisplay}
                onChange={(e) => setTimeDisplay(e.target.value as AccountSettings['time_display'])}
                disabled={!canEdit}
                className="input"
              >
                <option value="hh_mm">HH:MM (e.g. 1:30)</option>
                <option value="decimal">Decimal (e.g. 1.50)</option>
              </select>
            </Field>
            <Field label="Currency" htmlFor="currency">
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!canEdit}
                className="input"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Number format" htmlFor="number_format">
              <select
                id="number_format"
                value={numberFormat}
                onChange={(e) => setNumberFormat(e.target.value)}
                disabled={!canEdit}
                className="input"
              >
                {NUMBER_FORMATS.map((nf) => (
                  <option key={nf} value={nf}>
                    {nf}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving || !canEdit}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save preferences'}
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
        </form>
        )}
      </div>
    </SettingsLayout>
  );
}

function ReadValue({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-text">{children}</p>;
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
      <div className="divide-y divide-slate-100">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-4">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-text">
        {label}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span> : null}
      </label>
      <div>{children}</div>
    </div>
  );
}
