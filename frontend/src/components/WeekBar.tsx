import { Lock } from 'lucide-react';

import type { WeekDay } from '@/mock/dashboardData';
import { formatHoursDisplay, useTimeDisplay } from '@/utils/preferences';

interface WeekBarProps {
  days: WeekDay[];
  activeDate: Date;
  onSelectDay: (date: Date) => void;
  /** Predicate: is this date locked by an active submission? */
  isDateLocked?: (date: Date) => boolean;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function WeekBar({ days, activeDate, onSelectDay, isDateLocked }: WeekBarProps) {
  const timeDisplay = useTimeDisplay();
  const formatHours = (h: number) => formatHoursDisplay(h, timeDisplay);

  const total = days.reduce((sum, d) => sum + d.hours, 0);

  return (
    <div className="border-b border-slate-200 bg-white px-2 py-4">
      <div className="overflow-x-auto">
        <div className="flex min-w-[640px] items-stretch">
        {days.map((day) => {
          const isActive = sameDay(day.date, activeDate);
          const locked = isDateLocked?.(day.date) ?? false;
          return (
            <button
              key={day.date.toISOString()}
              type="button"
              onClick={() => onSelectDay(day.date)}
              className={`group relative flex-1 px-3 py-2 text-left transition ${
                isActive ? '' : 'hover:bg-slate-50/60'
              }`}
              title={locked ? 'This day is in a submitted timesheet' : undefined}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-base font-bold ${
                    isActive ? 'text-primary' : 'text-text'
                  }`}
                >
                  {day.label}
                </span>
                {locked ? (
                  <Lock
                    className={`h-3.5 w-3.5 ${isActive ? 'text-primary' : 'text-muted'}`}
                    aria-label="Locked"
                  />
                ) : null}
              </div>
              <div
                className={`mt-1 font-mono text-base font-semibold tabular-nums ${
                  isActive ? 'text-primary' : day.hours ? 'text-text' : 'text-muted'
                }`}
              >
                {formatHours(day.hours)}
              </div>
              {isActive ? (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
              ) : null}
            </button>
          );
        })}

        <div className="ml-3 flex min-w-[110px] flex-col justify-center px-3 py-2 text-right">
          <span className="text-base font-bold text-text">Week total</span>
          <span className="mt-1 font-mono text-base font-bold tabular-nums text-primary">
            {formatHours(total)}
          </span>
        </div>
        </div>
      </div>
    </div>
  );
}
