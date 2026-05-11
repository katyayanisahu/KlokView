import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type Period = 'week' | 'semimonth' | 'month' | 'quarter' | 'year' | 'all_time' | 'custom';

const PERIOD_LABEL: Record<Period, string> = {
  week: 'Week',
  semimonth: 'Semimonth',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  all_time: 'All time',
  custom: 'Custom',
};

interface PeriodSelectorProps {
  period: Period;
  onPeriodChange: (next: Period) => void;
  rangeLabel: string;
  onPrev?: () => void;
  onNext?: () => void;
  // When `period === 'custom'`, two date inputs are rendered inline.
  customStart?: string;
  customEnd?: string;
  onCustomChange?: (start: string, end: string) => void;
}

export default function PeriodSelector({
  period,
  onPeriodChange,
  rangeLabel,
  onPrev,
  onNext,
  customStart,
  customEnd,
  onCustomChange,
}: PeriodSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white">
        <button
          type="button"
          onClick={onPrev}
          className="flex h-9 w-9 items-center justify-center text-muted transition hover:bg-slate-50 hover:text-text disabled:opacity-40"
          aria-label="Previous period"
          disabled={!onPrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex h-9 w-9 items-center justify-center border-l border-slate-200 text-muted transition hover:bg-slate-50 hover:text-text disabled:opacity-40"
          aria-label="Next period"
          disabled={!onNext}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {period === 'custom' && onCustomChange ? (
        <div className="flex flex-wrap items-center gap-2 px-2 sm:px-4">
          <input
            type="date"
            value={customStart ?? ''}
            max={customEnd || undefined}
            onChange={(e) => onCustomChange(e.target.value, customEnd ?? '')}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-text"
            aria-label="Custom start date"
          />
          <span className="text-sm font-medium text-muted">to</span>
          <input
            type="date"
            value={customEnd ?? ''}
            min={customStart || undefined}
            onChange={(e) => onCustomChange(customStart ?? '', e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-text"
            aria-label="Custom end date"
          />
        </div>
      ) : (
        <h3 className="flex-1 px-2 text-center font-heading text-base font-bold text-text sm:flex-none sm:px-4 sm:text-left sm:text-lg">
          {rangeLabel}
        </h3>
      )}
      <div className="relative w-full sm:w-auto" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-text transition hover:bg-slate-50 sm:inline-flex sm:w-auto sm:grid-cols-none"
        >
          <span aria-hidden className="sm:hidden" />
          <span className="text-center sm:text-left">{PERIOD_LABEL[period]}</span>
          <ChevronDown className="h-4 w-4 justify-self-end text-muted" />
        </button>
        {open ? (
          <div className="absolute left-0 right-0 z-30 mt-1 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg sm:right-auto sm:w-44">
            {(Object.keys(PERIOD_LABEL) as Period[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onPeriodChange(key);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-primary-soft/40 ${
                  key === period ? 'bg-primary-soft/30 font-semibold text-primary' : 'text-text'
                }`}
              >
                {PERIOD_LABEL[key]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
