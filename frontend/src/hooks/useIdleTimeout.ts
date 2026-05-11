import { useCallback, useEffect, useRef } from 'react';

interface Options {
  // Total idle time (ms) after which onTimeout fires.
  timeoutMs: number;
  // Time (ms) before timeout when onWarn fires (e.g., 60_000 = 60s before).
  warningMs: number;
  onWarn: () => void;
  onTimeout: () => void;
  enabled?: boolean;
}

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'focus',
] as const;

// Don't reschedule timers on every single mousemove — once every 2s is plenty
// to keep an active session alive while keeping CPU/setTimeout churn low.
const ACTIVITY_THROTTLE_MS = 2000;

export interface IdleTimeoutHandle {
  keepAlive: () => void;
}

export function useIdleTimeout({
  timeoutMs,
  warningMs,
  onWarn,
  onTimeout,
  enabled = true,
}: Options): IdleTimeoutHandle {
  const warnTimerRef = useRef<number | null>(null);
  const finalTimerRef = useRef<number | null>(null);
  const lastResetRef = useRef<number>(Date.now());
  const onWarnRef = useRef(onWarn);
  const onTimeoutRef = useRef(onTimeout);
  const scheduleRef = useRef<() => void>(() => {});

  useEffect(() => {
    onWarnRef.current = onWarn;
    onTimeoutRef.current = onTimeout;
  }, [onWarn, onTimeout]);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) {
      scheduleRef.current = () => {};
      return;
    }

    const clearTimers = () => {
      if (warnTimerRef.current !== null) window.clearTimeout(warnTimerRef.current);
      if (finalTimerRef.current !== null) window.clearTimeout(finalTimerRef.current);
      warnTimerRef.current = null;
      finalTimerRef.current = null;
    };

    const scheduleTimers = () => {
      clearTimers();
      const warnDelay = Math.max(0, timeoutMs - warningMs);
      warnTimerRef.current = window.setTimeout(() => onWarnRef.current(), warnDelay);
      finalTimerRef.current = window.setTimeout(() => onTimeoutRef.current(), timeoutMs);
    };

    scheduleRef.current = scheduleTimers;

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastResetRef.current < ACTIVITY_THROTTLE_MS) return;
      lastResetRef.current = now;
      scheduleTimers();
    };

    scheduleTimers();
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true }),
    );

    return () => {
      clearTimers();
      scheduleRef.current = () => {};
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [timeoutMs, warningMs, enabled]);

  const keepAlive = useCallback(() => {
    lastResetRef.current = Date.now();
    scheduleRef.current();
  }, []);

  return { keepAlive };
}
