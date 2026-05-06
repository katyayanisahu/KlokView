import { CreditCard, Download, KeyRound, Plug, Puzzle, Settings as SettingsIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface SettingsSection {
  label: string;
  to: string;
  icon: LucideIcon;
}

// Mirrors the Harvest "Settings" sidebar — only Integrations is wired up
// today; the rest are placeholders for future epics so the layout matches.
const settingsSections: SettingsSection[] = [
  { label: 'Billing', to: '/settings/billing', icon: CreditCard },
  { label: 'Preferences', to: '/settings/preferences', icon: SettingsIcon },
  { label: 'Integrations', to: '/settings/integrations', icon: Plug },
  { label: 'Modules', to: '/settings/modules', icon: Puzzle },
  { label: 'Sign in security', to: '/settings/security', icon: KeyRound },
  { label: 'Import/Export', to: '/settings/import-export', icon: Download },
];

export default function SettingsSubnav() {
  return (
    <aside className="w-56 flex-none border-r border-slate-200 bg-white py-6">
      <nav className="flex flex-col">
        {settingsSections.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex items-center gap-2 border-l-[3px] px-5 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'border-primary bg-primary-soft/40 text-primary'
                  : 'border-transparent text-muted hover:bg-slate-50 hover:text-text'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : ''}`} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
