import { Clock, LogOut } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { getAccountSettings } from '@/api/accountSettings';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { useAuthStore } from '@/store/authStore';

// Warn the user this many seconds before the actual sign-out fires.
const WARNING_SECONDS = 60;

// Only enforce idle-sign-out if the workspace setting is at least this long.
// Set to 1 so the "2 minutes (test)" option in the dropdown is enforceable.
const MIN_TIMEOUT_MINUTES = 1;

/**
 * Mounted inside ProtectedRoute. Reads the workspace's `session_timeout_minutes`
 * and signs the user out after that much idle time. Shows a countdown warning
 * 60 seconds before logout so the user can keep their session alive.
 */
export default function SessionTimeoutManager() {
  const logout = useAuthStore((s) => s.logout);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [timeoutMinutes, setTimeoutMinutes] = useState<number | null>(null);
  const [warningVisible, setWarningVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS);

  // Pull the workspace's session timeout once per session. If the user updates
  // the setting on the Sign-in Security page, the new value applies on next load.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getAccountSettings()
      .then((s) => {
        if (!cancelled) setTimeoutMinutes(s.session_timeout_minutes);
      })
      .catch(() => {
        // Silently ignore — if we can't load the setting, we just don't enforce
        // timeout. The page still works.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handleWarn = useCallback(() => {
    setSecondsLeft(WARNING_SECONDS);
    setWarningVisible(true);
  }, []);

  const handleTimeout = useCallback(() => {
    setWarningVisible(false);
    logout();
  }, [logout]);

  const enabled =
    timeoutMinutes !== null && timeoutMinutes >= MIN_TIMEOUT_MINUTES && Boolean(accessToken);

  const { keepAlive } = useIdleTimeout({
    timeoutMs: (timeoutMinutes ?? 0) * 60 * 1000,
    warningMs: WARNING_SECONDS * 1000,
    onWarn: handleWarn,
    onTimeout: handleTimeout,
    enabled,
  });

  // Tick the countdown down while the warning is visible.
  useEffect(() => {
    if (!warningVisible) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [warningVisible]);

  // While the warning is showing, any meaningful interaction means the user is
  // back — dismiss the warning and reset the idle timer. We listen to click/key
  // events specifically (not mousemove) so a stray cursor wiggle doesn't dismiss.
  useEffect(() => {
    if (!warningVisible) return;
    const handleActivity = () => {
      setWarningVisible(false);
      keepAlive();
    };
    const events = ['mousedown', 'keydown', 'touchstart'] as const;
    // Small grace so the user actually sees the warning before any pending
    // event from before mount fires.
    const armTimer = window.setTimeout(() => {
      events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    }, 250);
    return () => {
      window.clearTimeout(armTimer);
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [warningVisible, keepAlive]);

  const handleStayIn = () => {
    setWarningVisible(false);
    keepAlive();
  };

  const handleSignOutNow = () => {
    setWarningVisible(false);
    logout();
  };

  if (!warningVisible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-text/40 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-primary-soft/40 px-5 py-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-primary ring-1 ring-primary/20">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <h2
              id="session-timeout-title"
              className="font-heading text-base font-bold text-text"
            >
              Are you still there?
            </h2>
            <p className="text-xs text-muted">
              You&apos;ll be signed out for inactivity.
            </p>
          </div>
        </div>
        <div className="px-5 py-5">
          <p className="text-sm text-text">
            For your security, you&apos;ll be signed out in{' '}
            <span className="font-bold tabular-nums text-primary">{secondsLeft}s</span>.
            Click <strong>Keep me signed in</strong> to stay.
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-linear"
              style={{ width: `${(secondsLeft / WARNING_SECONDS) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button
            type="button"
            onClick={handleSignOutNow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-text transition hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out now
          </button>
          <button
            type="button"
            onClick={handleStayIn}
            autoFocus
            className="btn-primary px-4 py-2 text-sm"
          >
            Keep me signed in
          </button>
        </div>
      </div>
    </div>
  );
}
