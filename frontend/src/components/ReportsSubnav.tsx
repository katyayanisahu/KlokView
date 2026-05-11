import { BarChart3, Bookmark, FileText, History, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';

interface ReportsTab {
  label: string;
  to: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const tabs: ReportsTab[] = [
  { label: 'Time', to: '/reports/time', icon: BarChart3 },
  { label: 'Profitability', to: '/reports/profitability', icon: TrendingUp, adminOnly: true },
  { label: 'Detailed Time', to: '/reports/detailed-time', icon: FileText },
  { label: 'Activity Log', to: '/reports/activity-log', icon: History },
  { label: 'Saved Reports', to: '/reports/saved', icon: Bookmark },
];

export default function ReportsSubnav() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'owner' || role === 'admin';
  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap sm:overflow-x-auto">
          {visibleTabs.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative inline-flex shrink-0 items-center gap-2 rounded-t-md px-3 py-3.5 text-sm font-semibold transition sm:px-4 sm:py-4 ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted hover:bg-slate-50 hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : ''}`} />
                  <span className="whitespace-nowrap">{label}</span>
                  {isActive ? (
                    <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-sm bg-primary" />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
