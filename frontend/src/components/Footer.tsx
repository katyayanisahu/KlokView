import { Link } from 'react-router-dom';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-slate-800 bg-text text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 sm:py-12 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-10 lg:px-8">
        <div>
          <Link to="/dashboard" className="inline-flex items-center" aria-label="KlokView home">
            <img src="/logo.svg" alt="KlokView" className="h-9 w-auto brightness-0 invert" />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
            Time tracking, project budgets, and team approvals — built for teams that ship.
          </p>
        </div>

        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white">
            Product
          </h3>
          <ul className="space-y-2.5 text-sm">
            <li>
              <Link to="/dashboard" className="transition hover:text-accent">
                Time
              </Link>
            </li>
            <li>
              <Link to="/projects" className="transition hover:text-accent">
                Projects
              </Link>
            </li>
            <li>
              <Link to="/team" className="transition hover:text-accent">
                Team
              </Link>
            </li>
            <li>
              <Link to="/reports" className="transition hover:text-accent">
                Reports
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white">
            Resources
          </h3>
          <ul className="space-y-2.5 text-sm">
            <li>
              <a href="#" className="transition hover:text-accent">
                Help center
              </a>
            </li>
            <li>
              <a href="#" className="transition hover:text-accent">
                Release notes
              </a>
            </li>
            <li>
              <a href="#" className="transition hover:text-accent">
                Status
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white">
            Company
          </h3>
          <ul className="space-y-2.5 text-sm">
            <li>
              <a href="#" className="transition hover:text-accent">
                About
              </a>
            </li>
            <li>
              <a href="#" className="transition hover:text-accent">
                Privacy
              </a>
            </li>
            <li>
              <a href="#" className="transition hover:text-accent">
                Terms
              </a>
            </li>
            <li>
              <a href="mailto:hello@klokview.app" className="transition hover:text-accent">
                Contact
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500 sm:px-6 lg:px-8">
          <p>© {year} KlokView. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <a href="#" className="transition hover:text-accent">
              Terms &amp; Conditions
            </a>
            <a href="#" className="transition hover:text-accent">
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
