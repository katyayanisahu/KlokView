import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/utils/errors';

const nameRegex = /^[\p{L}][\p{L}\s'-]*$/u;

const registerSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name is too long')
    .regex(nameRegex, 'Use letters only — no numbers or special characters'),
  last_name: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(50, 'Last name is too long')
    .regex(nameRegex, 'Use letters only — no numbers or special characters'),
  company_name: z
    .string()
    .trim()
    .min(2, 'Company name must be at least 2 characters')
    .max(150, 'Company name is too long'),
  email: z
    .string()
    .trim()
    .min(1, 'Work email is required')
    .email('Enter a valid email address')
    .max(254, 'Email is too long'),
  password: z
    .string()
    .min(8, 'Must be at least 8 characters')
    .max(128, 'Password is too long')
    .regex(/[A-Z]/, 'Must include an uppercase letter')
    .regex(/[a-z]/, 'Must include a lowercase letter')
    .regex(/[0-9]/, 'Must include a number'),
});

type RegisterValues = z.infer<typeof registerSchema>;

const benefits = [
  'Time Tracking. Easy and intuitive time tracking that captures all your time without changing the way you work.',
  'Reports & Analysis. Instantly create reports across projects, budgets, time, team capacity, cost breakdowns, and more.',
  'Invoicing & Payments. Turn tracked time into invoices and accept payments online.',
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const registerUser = useAuthStore((s) => s.register);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
    defaultValues: { first_name: '', last_name: '', company_name: '', email: '', password: '' },
  });

  const passwordValue = watch('password') ?? '';
  const passwordRules: Array<{ label: string; passes: boolean }> = [
    { label: 'At least 8 characters', passes: passwordValue.length >= 8 },
    { label: 'One uppercase letter', passes: /[A-Z]/.test(passwordValue) },
    { label: 'One lowercase letter', passes: /[a-z]/.test(passwordValue) },
    { label: 'One number', passes: /[0-9]/.test(passwordValue) },
  ];

  const onSubmit = async (values: RegisterValues) => {
    setServerError(null);
    try {
      await registerUser({
        email: values.email,
        full_name: `${values.first_name} ${values.last_name}`.trim(),
        password: values.password,
        company_name: values.company_name,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError(extractApiError(err, 'Unable to create account'));
    }
  };

  return (
    <div className="min-h-full bg-bg">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-20">
        <section className="flex flex-col justify-center">
          <div className="mb-8">
            <span className="brand-mark">trackflow</span>
          </div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">
            Track time with your team, the easy way
          </p>
          <h1 className="font-heading text-4xl font-bold leading-tight text-text lg:text-5xl">
            Finally, time tracking your team actually wants to use
          </h1>
          <ul className="mt-8 space-y-4">
            {benefits.map((item) => {
              const [title, ...rest] = item.split('. ');
              return (
                <li key={title} className="flex gap-3 text-sm text-text">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <span>
                    <strong className="font-semibold">{title}.</strong> {rest.join('. ')}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex items-start justify-center lg:pt-12">
          <div className="w-full max-w-md">
            <div className="card">
              <div className="mb-6 text-center">
                <h2 className="font-heading text-2xl font-bold text-text">Signup</h2>
                {/*<p className="mt-1 text-sm text-muted">No credit card required.</p>*/}
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="first_name" className="label">First name</label>
                    <input
                      id="first_name"
                      type="text"
                      autoComplete="given-name"
                      className="input"
                      {...register('first_name')}
                    />
                    {errors.first_name && (
                      <p className="mt-1 text-xs text-danger">{errors.first_name.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="last_name" className="label">Last name</label>
                    <input
                      id="last_name"
                      type="text"
                      autoComplete="family-name"
                      className="input"
                      {...register('last_name')}
                    />
                    {errors.last_name && (
                      <p className="mt-1 text-xs text-danger">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="company_name" className="label">Company name</label>
                  <input
                    id="company_name"
                    type="text"
                    autoComplete="organization"
                    className="input"
                    {...register('company_name')}
                  />
                  {errors.company_name && (
                    <p className="mt-1 text-xs text-danger">{errors.company_name.message}</p>
                  )}
                </div>

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
                  <label htmlFor="password" className="label">Password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    {...register('password')}
                  />
                  <ul className="mt-2 space-y-1">
                    {passwordRules.map((rule) => (
                      <li
                        key={rule.label}
                        className={`flex items-center gap-1.5 text-xs transition ${
                          rule.passes ? 'text-accent-dark' : 'text-muted'
                        }`}
                      >
                        <CheckCircle2
                          className={`h-3.5 w-3.5 ${rule.passes ? 'text-accent-dark' : 'text-slate-300'}`}
                          aria-hidden="true"
                        />
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                  {errors.password && (
                    <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
                  )}
                </div>

                {serverError && (
                  <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</div>
                )}

                <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating account…' : 'Submit'}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-sm text-muted">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
