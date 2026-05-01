import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderKanban,
  LogOut,
  Settings as SettingsIcon,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/types';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
  roles: Role[];
}

const navItems: NavItem[] = [
  {
    label: 'Time',
    description: 'Track time and submit weekly timesheets.',
    to: '/time',
    icon: Clock,
    roles: ['owner', 'admin', 'manager', 'member'],
  },
  {
    label: 'Projects',
    description: 'Browse projects, budgets, and team allocations.',
    to: '/projects',
    icon: FolderKanban,
    roles: ['owner', 'admin', 'manager', 'member'],
  },
  {
    label: 'Team',
    description: 'Invite members and manage their roles.',
    to: '/team',
    icon: Users,
    roles: ['owner', 'admin'],
  },
  {
    label: 'Reports',
    description: 'Time and utilization analytics across projects.',
    to: '/reports',
    icon: BarChart3,
    roles: ['owner', 'admin', 'manager', 'member'],
  },
  {
    label: 'Manage',
    description: 'Clients, tasks, and organizational roles.',
    to: '/manage',
    icon: SettingsIcon,
    roles: ['owner'],
  },
];

const CIRCUIT_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-width='1'%3E%3Cpath d='M0 30 L60 30 L60 90 L120 90 L120 150 L180 150'/%3E%3Cpath d='M30 0 L30 60 L90 60 L90 120 L150 120 L150 180'/%3E%3Cpath d='M0 100 L40 100'/%3E%3Cpath d='M140 0 L140 50'/%3E%3Cpath d='M70 130 L70 180'/%3E%3Cpath d='M100 40 L130 40'/%3E%3C/g%3E%3Cg fill='%235CDCA5' fill-opacity='0.18'%3E%3Ccircle cx='60' cy='30' r='2'/%3E%3Ccircle cx='60' cy='90' r='2'/%3E%3Ccircle cx='120' cy='90' r='2'/%3E%3Ccircle cx='30' cy='60' r='2'/%3E%3Ccircle cx='90' cy='60' r='2'/%3E%3Ccircle cx='90' cy='120' r='2'/%3E%3Ccircle cx='150' cy='120' r='2'/%3E%3C/g%3E%3Cg fill='%23ffffff' fill-opacity='0.08'%3E%3Ccircle cx='40' cy='100' r='1.2'/%3E%3Ccircle cx='130' cy='40' r='1.2'/%3E%3Ccircle cx='70' cy='130' r='1.2'/%3E%3C/g%3E%3C/svg%3E\")";

export default function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const role: Role = user?.role ?? 'member';
  const visibleNav = navItems.filter((item) => item.roles.includes(role));
  const canInvite = role === 'owner' || role === 'admin';
  const year = new Date().getFullYear();

  return (
    <>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 max-w-[85vw] flex-shrink-0 flex-col border-r border-white/10 text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-30 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{
          backgroundImage: `${CIRCUIT_PATTERN}, linear-gradient(180deg, #112B5E 0%, #0D2350 50%, #0A1B40 100%)`,
          backgroundSize: '180px 180px, auto',
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <NavLink
            to="/dashboard"
            onClick={onCloseMobile}
            className="flex select-none items-center gap-3"
            aria-label="TrackFlow home"
          >
            <img src="/logo.svg" alt="TrackFlow" className="h-9 w-auto" />
            <div>
              <p className="font-heading text-lg font-bold leading-tight text-white">TrackFlow</p>
              <p className="text-sm text-blue-100/90">Time Tracking Platform</p>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-blue-100 transition hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-2">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `group block rounded-xl px-4 py-3 transition ${
                      isActive
                        ? 'bg-white shadow-lg ring-1 ring-white/40'
                        : 'hover:bg-white/5'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-3">
                          <Icon
                            className={`h-5 w-5 ${
                              isActive ? 'text-primary' : 'text-blue-100'
                            }`}
                          />
                          <span
                            className={`font-heading text-base font-bold ${
                              isActive ? 'text-primary' : 'text-white'
                            }`}
                          >
                            {item.label}
                          </span>
                        </span>
                        {isActive ? (
                          <ChevronDown className="h-4 w-4 text-primary" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-blue-200/70 transition group-hover:text-blue-100" />
                        )}
                      </div>
                      <p
                        className={`mt-1.5 pl-[32px] text-sm leading-relaxed ${
                          isActive ? 'text-primary/90' : 'text-blue-100/90'
                        }`}
                      >
                        {item.description}
                      </p>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {canInvite ? (
        <div className="border-t border-white/10 px-3 py-3">
          <button
            type="button"
            onClick={() => navigate('/team/invite')}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-text shadow-sm transition hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <UserPlus className="h-4 w-4" />
            Invite teammate
          </button>
        </div>
      ) : null}

      <div className="border-t border-white/10 px-3 py-3">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-base font-semibold text-blue-100 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
        <p className="mt-3 px-3 text-sm text-blue-100/70">© {year} TrackFlow</p>
      </div>
    </aside>
    </>
  );
}
