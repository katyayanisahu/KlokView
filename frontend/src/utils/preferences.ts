import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import type {
  TimeDisplay,
  TimerMode,
  WeekStart,
} from '@/api/accountSettings';

// ---- Week boundaries ----

/**
 * Return the start of the week that contains `d`, respecting the user's
 * `week_starts_on` preference. Defaults to Monday when not provided.
 */
export function startOfWeek(d: Date, weekStartsOn: WeekStart = 'monday'): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun..6 Sat
  let diff: number;
  if (weekStartsOn === 'sunday') {
    diff = -day; // back to last Sunday
  } else {
    // Monday
    diff = day === 0 ? -6 : 1 - day;
  }
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfWeek(d: Date, weekStartsOn: WeekStart = 'monday'): Date {
  const start = startOfWeek(d, weekStartsOn);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

const DAY_LABELS_MON: ReadonlyArray<string> = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS_SUN: ReadonlyArray<string> = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getDayLabels(weekStartsOn: WeekStart = 'monday'): ReadonlyArray<string> {
  return weekStartsOn === 'sunday' ? DAY_LABELS_SUN : DAY_LABELS_MON;
}

// ---- Hours display ----

/**
 * Format `hours` as either decimal (e.g. "1.50") or HH:MM (e.g. "1:30")
 * based on the workspace `time_display` preference.
 */
export function formatHoursDisplay(hours: number, mode: TimeDisplay = 'decimal'): string {
  if (Number.isNaN(hours) || !Number.isFinite(hours)) return '0.00';
  if (mode === 'hh_mm') {
    const sign = hours < 0 ? '-' : '';
    const abs = Math.abs(hours);
    const h = Math.floor(abs);
    // round minutes to nearest, but cap at 59 to avoid edge case `1:60`
    let m = Math.round((abs - h) * 60);
    let extraH = 0;
    if (m === 60) {
      m = 0;
      extraH = 1;
    }
    return `${sign}${h + extraH}:${String(m).padStart(2, '0')}`;
  }
  return hours.toFixed(2);
}

// ---- Hooks: read directly from the account settings store ----

export function useWeekStart(): WeekStart {
  return useAccountSettingsStore(
    (s) => (s.settings?.week_starts_on as WeekStart | undefined) ?? 'monday',
  );
}

export function useTimeDisplay(): TimeDisplay {
  return useAccountSettingsStore(
    (s) => (s.settings?.time_display as TimeDisplay | undefined) ?? 'decimal',
  );
}

export function useDefaultCapacityHours(): string {
  return useAccountSettingsStore((s) => s.settings?.default_capacity_hours ?? '35');
}

export function useTimerMode(): TimerMode {
  return useAccountSettingsStore(
    (s) => (s.settings?.timer_mode as TimerMode | undefined) ?? 'duration',
  );
}

export function useFiscalYearStartMonth(): number {
  return useAccountSettingsStore(
    (s) => s.settings?.fiscal_year_start_month ?? 1,
  );
}

/** Memo-friendly hook for components that format many hours at once. */
export function useHoursFormatter(): (hours: number) => string {
  const mode = useTimeDisplay();
  return (h: number) => formatHoursDisplay(h, mode);
}
