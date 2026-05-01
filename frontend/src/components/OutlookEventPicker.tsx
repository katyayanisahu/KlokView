import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, Check, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';

import { listOutlookEvents, type OutlookEvent } from '@/api/integrations';

interface Props {
  /** Date in YYYY-MM-DD to fetch events for. */
  date: string;
  onClose: () => void;
  /** Called with the chosen event so the parent can pre-fill the time-entry modal. */
  onPick: (event: OutlookEvent) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export default function OutlookEventPicker({ date, onClose, onPick }: Props) {
  const [events, setEvents] = useState<OutlookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOutlookEvents(date);
      setEvents(data);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        'Could not load Outlook events.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close"
      />
      <section className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <h3 className="font-heading text-base font-bold text-text">Pull in a calendar event</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={load}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-white"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
            </div>
          ) : error ? (
            <div className="m-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : events.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              No Outlook events for {date}.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {events.map((event) => (
                <li
                  key={event.outlook_event_id}
                  className={`flex items-start gap-3 px-5 py-3.5 transition ${
                    event.already_imported
                      ? 'cursor-not-allowed bg-slate-50 opacity-60'
                      : 'cursor-pointer hover:bg-primary-soft/30'
                  }`}
                  onClick={() => {
                    if (event.already_imported) return;
                    onPick(event);
                  }}
                  aria-disabled={event.already_imported}
                >
                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                    {event.already_imported ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <CalendarIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text">{event.subject}</p>
                    <p className="text-xs text-muted">
                      {formatTime(event.start)} – {formatTime(event.end)} · {formatHours(event.duration_hours)}h
                      {event.organizer ? ` · ${event.organizer}` : ''}
                    </p>
                    {event.body_preview ? (
                      <p className="mt-1 line-clamp-2 text-xs text-text/70">{event.body_preview}</p>
                    ) : null}
                    {event.already_imported ? (
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-accent-dark">
                        Already imported
                      </p>
                    ) : null}
                  </div>
                  {event.web_link ? (
                    <a
                      href={event.web_link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-white hover:text-text"
                      aria-label="Open in Outlook"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
