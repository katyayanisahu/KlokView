import { Briefcase, ListChecks, Tag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface ManageSection {
  label: string;
  to: string;
  icon: LucideIcon;
}

const manageSections: ManageSection[] = [
  { label: 'Clients', to: '/manage/clients', icon: Briefcase },
  { label: 'Tasks', to: '/manage/tasks', icon: ListChecks },
  { label: 'Roles', to: '/manage/roles', icon: Tag },
];

export default function ManageSubnav() {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-6">
        {manageSections.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative inline-flex items-center gap-2 rounded-t-md px-4 py-4 text-sm font-semibold transition ${
                isActive
                  ? 'text-primary'
                  : 'text-muted hover:bg-slate-50 hover:text-text'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : ''}`} />
                {label}
                {isActive ? (
                  <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-sm bg-primary" />
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
