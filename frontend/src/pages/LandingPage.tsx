import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FolderKanban,
  Mail,
  Play,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';

import Footer from '@/components/Footer';
import { useAuthStore } from '@/store/authStore';

const FEATURES = [
  {
    icon: Clock,
    title: 'Track time effortlessly',
    body: 'One-click timers, day & week views, and quick edits — Harvest-style speed without the price tag.',
  },
  {
    icon: FolderKanban,
    title: 'Projects & budgets',
    body: 'Hour budgets, per-task billable toggles, and live spent/remaining indicators on every project.',
  },
  {
    icon: Users,
    title: 'Team capacity',
    body: 'Invite teammates, assign managers, and see who is over- or under-allocated each week.',
  },
  {
    icon: ShieldCheck,
    title: 'Approval workflow',
    body: 'Members submit timesheets weekly; managers approve, reject, or send back for revision.',
  },
  {
    icon: BarChart3,
    title: 'Reports that ship',
    body: 'Time, utilization, and detailed activity reports with CSV export — ready for invoicing.',
  },
  {
    icon: Mail,
    title: 'Outlook calendar sync',
    body: 'Pull meeting blocks straight from Outlook into your timesheet — no copy-paste, no double-entry.',
  },
];

const HIGHLIGHTS = [
  'Mint-fresh UI built with Tailwind & React — fast, responsive, and friendly on mobile',
  'Multi-tenant from day one — every workspace is isolated by design',
  'JWT auth with silent refresh, role-aware navigation, and per-page guards',
  'Open-source-friendly stack: Django REST + PostgreSQL + Vite',
];

export default function LandingPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  // Logged-in users skip the marketing page and go straight to the app.
  if (accessToken) {
    return <Navigate to="/time" replace />;
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex select-none items-center gap-2.5" aria-label="TrackFlow home">
            <img src="/logo.svg" alt="" className="h-8 w-auto" />
            <span className="font-heading text-xl font-bold text-primary">TrackFlow</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-text/80 sm:flex">
            <a href="#features" className="transition hover:text-primary">Features</a>
            <a href="#how" className="transition hover:text-primary">How it works</a>
            <a href="#stack" className="transition hover:text-primary">Why TrackFlow</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-text transition hover:bg-slate-100"
            >
              Sign in
            </Link>
            <Link to="/register" className="btn-primary">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-primary-soft/60 via-primary-soft/30 to-transparent"
          aria-hidden="true"
        />
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary shadow-sm">
              <Zap className="h-3.5 w-3.5" />
              Built for teams that ship
            </span>
            <h1 className="mt-5 font-heading text-4xl font-bold leading-tight text-text sm:text-5xl lg:text-6xl">
              Time tracking your team{' '}
              <span className="text-primary">actually wants</span> to use.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-text/75 sm:text-lg">
              TrackFlow gives you Harvest-style time entry, project budgets, weekly approvals,
              and Outlook calendar sync — in one focused, opinionated workspace.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-bold text-text shadow-md transition hover:-translate-y-0.5 hover:bg-accent-dark hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-text transition hover:border-primary/40 hover:bg-primary-soft/30"
              >
                <Play className="h-4 w-4 text-primary" />
                See features
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-text/70">
              <li className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-accent-dark" />
                No credit card required
              </li>
              <li className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-accent-dark" />
                2-minute setup
              </li>
              <li className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-accent-dark" />
                Cancel anytime
              </li>
            </ul>
          </div>

          {/* Hero visual — stylized timesheet card */}
          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/10 to-transparent blur-2xl" aria-hidden="true" />
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Today</p>
                  <p className="font-heading text-base font-bold text-text">Tue, May 5</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-dark">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-dark" />
                  Running 0:23:14
                </span>
              </div>
              <ul className="mt-3 space-y-2.5">
                {[
                  { project: 'Acme Corp', task: 'Design review', hours: '0:23', running: true },
                  { project: 'Bergen Debate Club', task: 'Marketing', hours: '0:30', billable: true },
                  { project: 'Example Client', task: 'Programming', hours: '2:00', billable: true },
                  { project: 'Internal', task: 'Standup', hours: '0:15' },
                ].map((row) => (
                  <li
                    key={row.project + row.task}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${
                      row.running ? 'border-accent/40 bg-accent-soft/30' : 'border-slate-100 bg-slate-50/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-text">{row.project}</p>
                      <p className="text-xs text-muted">{row.task}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.billable ? (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-dark">
                          Billable
                        </span>
                      ) : null}
                      <span className="font-mono text-base font-bold tabular-nums text-text">{row.hours}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Week total</span>
                <span className="font-mono text-xl font-bold tabular-nums text-primary">14:08</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Everything in one place</p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-text sm:text-4xl">
              Track. Budget. Approve. Report.
            </h2>
            <p className="mt-3 text-base text-text/75">
              The four jobs your team needs to get right — with none of the bloat enterprise tools layer on top.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary transition group-hover:bg-primary group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-heading text-lg font-bold text-text">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-text/70">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-bg py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">How it works</p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-text sm:text-4xl">
              Three steps to a clean timesheet
            </h2>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              {
                n: '01',
                t: 'Set up your workspace',
                b: 'Create your account, add a few clients & projects, invite your team. Two minutes, tops.',
              },
              {
                n: '02',
                t: 'Track time how you like',
                b: 'Start a timer on a project row, type a manual entry, or pull a meeting straight from Outlook.',
              },
              {
                n: '03',
                t: 'Submit, approve, report',
                b: 'Members submit weekly. Managers approve in one click. Export a polished report at month-end.',
              },
            ].map((step) => (
              <div key={step.n} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                  {step.n}
                </span>
                <h3 className="mt-4 font-heading text-lg font-bold text-text">{step.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text/70">{step.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why TrackFlow */}
      <section id="stack" className="border-t border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Why TrackFlow</p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-text sm:text-4xl">
              Opinionated where it matters. Out of the way everywhere else.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-text/75">
              We picked the patterns Harvest got right and skipped everything that slows your team down.
              No 20-tab settings panel. No "enterprise" jargon. Just the workflow you'd actually build for yourself.
            </p>
            <Link
              to="/register"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark"
            >
              Create your workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ul className="space-y-4">
            {HIGHLIGHTS.map((line) => (
              <li key={line} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-bg/60 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-dark" />
                <span className="text-sm font-medium leading-relaxed text-text">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA strip */}
      <section className="bg-text">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6 lg:px-8">
          <div>
            <h3 className="font-heading text-2xl font-bold text-white sm:text-3xl">
              Ready to ditch the spreadsheet?
            </h3>
            <p className="mt-1.5 text-sm text-slate-300">
              Free to start. No credit card. Invite your whole team in one click.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-bold text-text shadow-md transition hover:bg-accent-dark"
            >
              Get started free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
