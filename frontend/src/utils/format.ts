import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import type { BudgetType, ProjectType } from '@/types';

export function formatBudget(amount: string | null, budgetType: BudgetType): string {
  if (!amount || budgetType === 'none') return '—';
  const num = Number.parseFloat(amount);
  if (Number.isNaN(num)) return '—';
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Hours-only display per V2 spec — legacy fee budgets render as hours too
  // (their stored amount is the budget number; unit semantics now uniformly "hr").
  return `${formatted} hr`;
}

// Currency code → display symbol. Mirrors Settings → Preferences.
const CURRENCY_SYMBOL: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  AED: 'د.إ ',
  SGD: 'S$',
};

const NUMBER_FORMAT_LOCALE: Record<string, string> = {
  '1,234.56': 'en-US',
  '1.234,56': 'de-DE',
  '1 234,56': 'fr-FR',
};

/**
 * Format a money value using the workspace currency + number_format preferences.
 * Falls back to USD / en-US when the settings store hasn't loaded yet.
 */
export function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  const settings = useAccountSettingsStore.getState().settings;
  const symbol = CURRENCY_SYMBOL[settings?.currency ?? 'USD'] ?? '$';
  const locale = NUMBER_FORMAT_LOCALE[settings?.number_format ?? '1,234.56'] ?? 'en-US';
  if (Number.isNaN(num)) return `${symbol}0.00`;
  const formatted = num.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  time_materials: 'Time & Materials',
  fixed_fee: 'Fixed Fee',
  non_billable: 'Non-Billable',
};

export const PROJECT_TYPE_DESCRIPTION: Record<ProjectType, string> = {
  time_materials: 'Bill by the hour, with billable rates',
  fixed_fee: 'Bill a set price, regardless of time tracked',
  non_billable: 'Not billed to a client',
};
