import { Download, KeyRound, Plug, Puzzle, Settings as SettingsIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface SettingsSection {
  label: string;
  to: string;
  icon: LucideIcon;
}

const settingsSections: SettingsSection[] = [
  { label: 'Preferences', to: '/settings/preferences', icon: SettingsIcon },
  { label: 'Integrations', to: '/settings/integrations', icon: Plug },
  { label: 'Modules', to: '/settings/modules', icon: Puzzle },
  { label: 'Sign in security', to: '/settings/security', icon: KeyRound },
  { label: 'Import/Export', to: '/settings/import-export', icon: Download },
];

export default function SettingsSubnav() {
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <nav className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {settingsSections.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                isActive
                  ? 'bg-primary-soft/60'
                  : 'text-muted hover:bg-primary-soft/40 hover:text-primary'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition ${
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-primary-soft/60 text-primary group-hover:bg-primary-soft'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span
                  className={
                    isActive ? 'font-bold text-text' : 'font-semibold'
                  }
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
