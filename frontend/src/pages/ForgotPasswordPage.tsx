import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { passwordResetRequest } from '@/api/auth';
import { extractApiError } from '@/utils/errors';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setResendNotice(null);
    try {
      await passwordResetRequest(values.email);
      setSubmittedEmail(values.email);
    } catch (err) {
      setServerError(extractApiError(err, 'Something went wrong. Please try again.'));
    }
  };

  const handleResend = async () => {
    if (!submittedEmail || isResending) return;
    setIsResending(true);
    setResendNotice(null);
    try {
      await passwordResetRequest(submittedEmail);
      setResendNotice('Reset link sent again. Please check your inbox.');
    } catch (err) {
      setResendNotice(extractApiError(err, 'Could not resend. Please try again in a moment.'));
    } finally {
      setIsResending(false);
    }
  };

  const handleUseDifferentEmail = () => {
    setSubmittedEmail(null);
    setResendNotice(null);
    reset({ email: '' });
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-bg to-primary-soft/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="brand-mark">klokview</span>
          <h1 className="mt-6 font-heading text-2xl font-semibold text-text">
            {submittedEmail ? 'Check your email' : 'Reset your password'}
          </h1>
          {!submittedEmail && (
            <p className="mt-2 text-sm text-muted">
              Enter the email linked to your account and we&apos;ll send you a reset link.
            </p>
          )}
        </div>

        <div className="card">
          {submittedEmail ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft">
                <Mail className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>

              <div className="space-y-2">
                <p className="text-sm text-text">
                  If an account exists for <strong className="break-all">{submittedEmail}</strong>,
                  we&apos;ve sent a password reset link to it.
                </p>
                <p className="text-xs text-muted">
                  The link will expire in 3 days. Didn&apos;t see it? Check your spam folder.
                </p>
              </div>

              {resendNotice && (
                <div className="rounded-md bg-accent-soft px-3 py-2 text-xs text-accent-dark">
                  {resendNotice}
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending}
                  className="btn-outline w-full"
                >
                  {isResending ? 'Resending…' : 'Resend email'}
                </button>
                <button
                  type="button"
                  onClick={handleUseDifferentEmail}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Use a different email
                </button>
              </div>

              <p className="border-t border-slate-100 pt-4 text-sm text-muted">
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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

              {serverError && (
                <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </button>

              <p className="text-center text-sm text-muted">
                Remembered it?{' '}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
