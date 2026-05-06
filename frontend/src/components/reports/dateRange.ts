import type { Period } from './PeriodSelector';

export interface DateRange {
  start: string; // ISO yyyy-mm-dd
  end: string;   // ISO yyyy-mm-dd
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function startOfWeekMon(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
}

/** Compute the start/end ISO date pair for a Period anchored at `anchor`. */
export function computeRange(period: Period, anchor: Date): DateRange {
  if (period === 'week') {
    const start = startOfWeekMon(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: toIso(start), end: toIso(end) };
  }
  if (period === 'semimonth') {
    const day = anchor.getDate();
    if (day <= 15) {
      return {
        start: toIso(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
        end: toIso(new Date(anchor.getFullYear(), anchor.getMonth(), 15)),
      };
    }
    return {
      start: toIso(new Date(anchor.getFullYear(), anchor.getMonth(), 16)),
      end: toIso(endOfMonth(anchor)),
    };
  }
  if (period === 'month') {
    return { start: toIso(startOfMonth(anchor)), end: toIso(endOfMonth(anchor)) };
  }
  if (period === 'quarter') {
    return { start: toIso(startOfQuarter(anchor)), end: toIso(endOfQuarter(anchor)) };
  }
  if (period === 'year') {
    return {
      start: toIso(new Date(anchor.getFullYear(), 0, 1)),
      end: toIso(new Date(anchor.getFullYear(), 11, 31)),
    };
  }
  if (period === 'all_time') {
    return { start: '2000-01-01', end: toIso(anchor) };
  }
  // 'custom' — fall back to a single-month window; pages with custom inputs
  // override start/end directly.
  return { start: toIso(startOfMonth(anchor)), end: toIso(endOfMonth(anchor)) };
}

/** Move the anchor forward (+1) or backward (-1) by one Period unit. */
export function nudgeAnchor(anchor: Date, period: Period, direction: 1 | -1): Date {
  const a = new Date(anchor);
  if (period === 'week') a.setDate(a.getDate() + direction * 7);
  else if (period === 'semimonth') a.setDate(a.getDate() + direction * 15);
  else if (period === 'month') a.setMonth(a.getMonth() + direction);
  else if (period === 'quarter') a.setMonth(a.getMonth() + direction * 3);
  else if (period === 'year') a.setFullYear(a.getFullYear() + direction);
  return a;
}

/** Friendly label for a window — collapses same-month / same-year ranges. */
export function formatRangeLabel(startIso: string, endIso: string): string {
  const start = fromIso(startIso);
  const end = fromIso(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startIso} – ${endIso}`;
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
  }
  if (sameYear) {
    return `${start.getDate()} ${MONTH_NAMES[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
  }
  return `${start.getDate()} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
}
