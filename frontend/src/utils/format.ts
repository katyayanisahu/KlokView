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

export function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (Number.isNaN(num)) return '$0.00';
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
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
