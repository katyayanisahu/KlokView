export function formatMoney(n: number, withSign = false): string {
  const sign = withSign && n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${formatted}`;
}

export function formatHours(n: number): string {
  return n.toFixed(2);
}

export function formatPercent(n: number): string {
  return `${n.toFixed(0)}%`;
}
