import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import { formatHoursDisplay } from '@/utils/preferences';
import type { TimeDisplay } from '@/api/accountSettings';

// Currency code → display symbol. Mirrors the dropdown in Settings → Preferences.
const CURRENCY_SYMBOL: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  AED: 'د.إ ',
  SGD: 'S$',
};

// Number-format choice → locale key for Number.prototype.toLocaleString.
const NUMBER_FORMAT_LOCALE: Record<string, string> = {
  '1,234.56': 'en-US',
  '1.234,56': 'de-DE',
  '1 234,56': 'fr-FR',
};

/**
 * Format a money value using the workspace currency + number format preferences.
 * Falls back to USD / en-US when the store hasn't loaded yet.
 */
export function formatMoney(n: number, withSign = false): string {
  const settings = useAccountSettingsStore.getState().settings;
  const currency = settings?.currency ?? 'USD';
  const numberFormat = settings?.number_format ?? '1,234.56';

  const symbol = CURRENCY_SYMBOL[currency] ?? '$';
  const locale = NUMBER_FORMAT_LOCALE[numberFormat] ?? 'en-US';

  const sign = withSign && n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${symbol}${formatted}`;
}

/**
 * Format hours respecting the workspace `time_display` preference.
 * Reads the store synchronously — safe to call from non-hook contexts (e.g. CSV export).
 */
export function formatHours(n: number): string {
  const mode =
    (useAccountSettingsStore.getState().settings?.time_display as TimeDisplay | undefined) ??
    'decimal';
  return formatHoursDisplay(n, mode);
}

export function formatPercent(n: number): string {
  return `${n.toFixed(0)}%`;
}
