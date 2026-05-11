import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';

const SSO_ERROR_MESSAGES: Record<string, string> = {
  not_configured: 'Microsoft sign-in is not configured for this server.',
  not_invited: 'This Microsoft account is not invited to any workspace yet. Ask your admin to invite you.',
  archived: 'Your account is archived. Contact your workspace admin.',
  workspace_disabled: 'Microsoft sign-in is not enabled for your workspace.',
  invalid_state: 'Sign-in session expired. Please try again.',
  exchange_failed: 'Could not complete Microsoft sign-in. Please try again.',
  no_email: 'Could not read your Microsoft account email.',
  missing_params: 'Sign-in callback was incomplete.',
};

function getApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
}

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

interface LocationState {
  from?: { pathname?: string };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const [serverError, setServerError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard';

  useEffect(() => {
    const ssoError = searchParams.get('sso_error');
    if (ssoError) {
      setServerError(SSO_ERROR_MESSAGES[ssoError] ?? 'Microsoft sign-in failed.');
      const next = new URLSearchParams(searchParams);
      next.delete('sso_error');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(extractApiError(err, 'Invalid email or password'));
    }
  };

  const onMicrosoftSignIn = () => {
    const returnTo = encodeURIComponent(from);
    window.location.href = `${getApiBaseUrl()}/auth/microsoft/start/?return_to=${returnTo}`;
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-bg to-primary-soft/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="brand-mark">klokview</span>
          <h1 className="mt-6 font-heading text-2xl font-semibold text-text">Sign in to KlokView</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="label">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="input"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="label mb-0">Password</label>
              <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              {...register('password')}
            />
            {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
          </div>

          {serverError && (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs uppercase tracking-wide text-muted">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onMicrosoftSignIn}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-text shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <svg viewBox="0 0 23 23" className="h-4 w-4" aria-hidden="true">
              <path fill="#f3f3f3" d="M0 0h23v23H0z" />
              <path fill="#f35325" d="M1 1h10v10H1z" />
              <path fill="#81bc06" d="M12 1h10v10H12z" />
              <path fill="#05a6f0" d="M1 12h10v10H1z" />
              <path fill="#ffba08" d="M12 12h10v10H12z" />
            </svg>
            Sign in with Microsoft
          </button>

          <p className="pt-2 text-center text-sm text-muted">
            No account yet?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
