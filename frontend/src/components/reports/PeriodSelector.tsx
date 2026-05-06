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
}

export default function PeriodSelector({
  period,
  onPeriodChange,
  rangeLabel,
  onPrev,
  onNext,
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
      <h3 className="font-heading text-base font-bold text-text sm:text-lg">{rangeLabel}</h3>
      <div className="relative ml-auto sm:ml-0" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-text transition hover:bg-slate-50"
        >
          {PERIOD_LABEL[period]}
          <ChevronDown className="h-4 w-4 text-muted" />
        </button>
        {open ? (
          <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
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
