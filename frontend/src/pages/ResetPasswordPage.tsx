import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { passwordResetConfirm } from '@/api/auth';
import { extractApiError } from '@/utils/errors';

const schema = z
  .object({
    new_password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const uid = params.get('uid') ?? '';
  const token = params.get('token') ?? '';
  const missingParams = !uid || !token;

  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: '', confirm_password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await passwordResetConfirm({ uid, token, new_password: values.new_password });
      setSuccess(true);
    } catch (err) {
      setServerError(extractApiError(err, 'Reset link is invalid or expired.'));
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-bg to-primary-soft/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="brand-mark">klokview</span>
          <h1 className="mt-6 font-heading text-2xl font-semibold text-text">Set a new password</h1>
        </div>

        <div className="card">
          {missingParams ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger/10">
                <ShieldAlert className="h-7 w-7 text-danger" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-text">This reset link is invalid or incomplete.</p>
                <p className="text-xs text-muted">
                  Request a fresh link from the forgot password page.
                </p>
              </div>
              <Link to="/forgot-password" className="btn-primary w-full">
                Request new link
              </Link>
            </div>
          ) : success ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
                <CheckCircle2 className="h-7 w-7 text-accent-dark" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-text">Password reset successful</p>
                <p className="text-xs text-muted">
                  You can now sign in with your new password.
                </p>
              </div>
              <Link to="/login" className="btn-primary w-full">
                Sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div>
                <label htmlFor="new_password" className="label">New password</label>
                <input
                  id="new_password"
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  {...register('new_password')}
                />
                {errors.new_password && (
                  <p className="mt-1 text-xs text-danger">{errors.new_password.message}</p>
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
                {isSubmitting ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
