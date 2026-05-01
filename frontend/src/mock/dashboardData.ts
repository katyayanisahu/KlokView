export interface WeekDay {
  label: string;
  shortLabel: string;
  date: Date;
  hours: number;
}

export interface TimesheetTotals {
  total: number;
  billable: number;
  nonBillable: number;
}

function startOfWeek(reference: Date): Date {
  const d = new Date(reference);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

export function buildWeek(reference: Date = new Date()): WeekDay[] {
  const start = startOfWeek(reference);
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const shorts = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return labels.map((label, idx) => {
    const date = new Date(start);
    date.setDate(start.getDate() + idx);
    return {
      label,
      shortLabel: shorts[idx],
      date,
      hours: 0,
    };
  });
}

export const mockTotals: TimesheetTotals = {
  total: 0,
  billable: 0,
  nonBillable: 0,
};

export const emptyStateQuote = {
  quote: 'The price of discipline is always less than the pain of regret.',
  author: 'Anonymous',
};
