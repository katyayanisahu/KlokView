/**
 * Shared period-range helpers — used by both Project Detail and Projects List
 * pages so the dropdown semantics + date math stay consistent.
 */

export type RangeKey =
  | 'this_week'
  | 'this_semimonth'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'all_time'
  | 'custom';

export const RANGE_LABEL: Record<RangeKey, string> = {
  this_week: 'Week',
  this_semimonth: 'Semimonth',
  this_month: 'Month',
  this_quarter: 'Quarter',
  this_year: 'Year',
  all_time: 'All time',
  custom: 'Custom',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function computeRangeDates(
  range: RangeKey,
  customStart?: string,
  customEnd?: string,
): { start?: string; end?: string } {
  const today = new Date();
  if (range === 'custom') {
    return {
      start: customStart || iso(today),
      end: customEnd || iso(today),
    };
  }
  if (range === 'all_time') {
    return { start: '2000-01-01', end: iso(today) };
  }
  if (range === 'this_week') {
    const dow = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: iso(start), end: iso(end) };
  }
  if (range === 'this_semimonth') {
    const y = today.getFullYear();
    const m = today.getMonth();
    const firstHalf = today.getDate() <= 15;
    const start = new Date(y, m, firstHalf ? 1 : 16);
    const end = firstHalf ? new Date(y, m, 15) : new Date(y, m + 1, 0);
    return { start: iso(start), end: iso(end) };
  }
  if (range === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: iso(start), end: iso(end) };
  }
  if (range === 'this_quarter') {
    const q = Math.floor(today.getMonth() / 3);
    const start = new Date(today.getFullYear(), q * 3, 1);
    const end = new Date(today.getFullYear(), q * 3 + 3, 0);
    return { start: iso(start), end: iso(end) };
  }
  // this_year
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  return { start: iso(start), end: iso(end) };
}

export function formatDateRangeLabel(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sameYear = s.getFullYear() === e.getFullYear();
  const monthFmt: Intl.DateTimeFormatOptions = { month: 'short' };
  const fullFmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  if (sameMonth) {
    return `${s.getDate()} – ${e.getDate()} ${s.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  }
  if (sameYear) {
    return `${s.getDate()} ${s.toLocaleDateString('en-US', monthFmt)} – ${e.getDate()} ${e.toLocaleDateString('en-US', monthFmt)} ${s.getFullYear()}`;
  }
  return `${s.toLocaleDateString('en-US', fullFmt)} – ${e.toLocaleDateString('en-US', fullFmt)}`;
}

export function formatRangeHeader(range: Exclude<RangeKey, 'all_time' | 'custom'>): string {
  const { start, end } = computeRangeDates(range);
  return formatDateRangeLabel(start, end);
}
