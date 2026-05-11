import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { meRequest } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';

export default function MicrosoftCallbackPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const fragment = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(fragment);
    const access = params.get('access');
    const refresh = params.get('refresh');
    const returnTo = params.get('return_to') || '/dashboard';

    if (!access || !refresh) {
      navigate('/login?sso_error=missing_params', { replace: true });
      return;
    }

    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);

    (async () => {
      try {
        const user = await meRequest();
        setSession({ user, access, refresh });
        window.history.replaceState(null, '', window.location.pathname);
        navigate(returnTo, { replace: true });
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setError('Could not load your profile. Please try signing in again.');
      }
    })();
  }, [navigate, setSession]);

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-bg to-primary-soft/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="card text-center">
          {error ? (
            <>
              <h1 className="font-heading text-xl font-semibold text-danger">Sign-in failed</h1>
              <p className="mt-2 text-sm text-muted">{error}</p>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="btn-primary mt-4"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <h1 className="font-heading text-xl font-semibold text-text">Signing you in…</h1>
              <p className="mt-2 text-sm text-muted">Hang tight, finishing Microsoft sign-in.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
