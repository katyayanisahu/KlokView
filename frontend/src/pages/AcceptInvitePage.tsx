import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { acceptInvite, validateInvite } from '@/api/invites';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';
import type { InviteInvalidReason, InviteValidateResponse } from '@/types';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type FormValues = z.infer<typeof schema>;

const invalidMessages: Record<InviteInvalidReason, string> = {
  expired: 'This invite link has expired. Ask your admin to resend it.',
  already_used: 'You&apos;ve already set up your account. Please log in.',
  not_found: 'This invite link is invalid.',
};

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [invite, setInvite] = useState<InviteValidateResponse | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm_password: '' },
  });

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setInvite({ isValid: false, reason: 'not_found' });
      setStatus('invalid');
      return;
    }
    validateInvite(token)
      .then((res) => {
        if (cancelled) return;
        setInvite(res);
        setStatus(res.isValid ? 'valid' : 'invalid');
      })
      .catch(() => {
        if (cancelled) return;
        setInvite({ isValid: false, reason: 'not_found' });
        setStatus('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const result = await acceptInvite({
        token,
        password: values.password,
        confirm_password: values.confirm_password,
      });
      setSession({ user: result.user, access: result.access, refresh: result.refresh });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError(extractApiError(err, 'Unable to accept invite. The link may be expired.'));
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-bg to-primary-soft/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="brand-mark">klokview</span>
        </div>

        <div className="card">
          {status === 'loading' ? (
            <div className="py-8 text-center text-sm text-muted">Validating your invite link…</div>
          ) : null}

          {status === 'invalid' && invite && !invite.isValid ? (
            <div className="space-y-4 text-center">
              <h1 className="font-heading text-xl font-bold text-text">Invite unavailable</h1>
              <p className="text-sm text-muted">{invalidMessages[invite.reason]}</p>
              <Link to="/login" className="btn-primary w-full">
                Go to sign in
              </Link>
            </div>
          ) : null}

          {status === 'valid' && invite && invite.isValid ? (
            <>
              <div className="mb-6 text-center">
                <h1 className="font-heading text-2xl font-bold text-text">
                  Hi {invite.firstName}!
                </h1>
                <p className="mt-1 text-sm text-muted">
                  You&apos;ve been invited to join <strong>{invite.accountName}</strong> on KlokView. Set your
                  password to get started.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="email" className="label">Email</label>
                  <input
                    id="email"
                    type="email"
                    className="input bg-slate-50 text-muted"
                    value={invite.email}
                    readOnly
                    disabled
                  />
                </div>

                <div>
                  <label htmlFor="password" className="label">Password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirm_password" className="label">Confirm password</label>
                  <input
                    id="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    {...register('confirm_password')}
                  />
                  {errors.confirm_password && (
                    <p className="mt-1 text-xs text-danger">{errors.confirm_password.message}</p>
                  )}
                </div>

                {serverError && (
                  <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</div>
                )}

                <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Setting up…' : 'Set password & join KlokView'}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
