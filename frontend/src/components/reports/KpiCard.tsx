import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: string;
  sublabel?: string;
  trend?: {
    value: number; // positive or negative percent
    label?: string;
  };
  tone?: 'default' | 'positive' | 'negative';
  footer?: ReactNode;
}

export default function KpiCard({ label, value, sublabel, trend, tone = 'default', footer }: KpiCardProps) {
  const toneClass =
    tone === 'positive'
      ? 'text-success'
      : tone === 'negative'
        ? 'text-danger'
        : 'text-text';

  const trendColor = trend && trend.value >= 0 ? 'text-success' : 'text-danger';
  const trendSign = trend && trend.value >= 0 ? '+' : '';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className={`font-heading text-2xl font-bold leading-tight sm:text-3xl ${toneClass}`}>
          {value}
        </span>
        {trend ? (
          <span className={`text-xs font-semibold ${trendColor}`}>
            ({trendSign}
            {trend.value.toFixed(2)}%{trend.label ? ` ${trend.label}` : ''})
          </span>
        ) : null}
      </div>
      {sublabel ? <p className="mt-1 text-xs text-muted">{sublabel}</p> : null}
      {footer ? <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-muted">{footer}</div> : null}
    </div>
  );
}
