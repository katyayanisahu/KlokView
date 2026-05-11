import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Bell, Briefcase, ShieldCheck, UserCircle2, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { getMyProfile } from '@/api/profile';
import { useAuthStore } from '@/store/authStore';
import type { MyProfile, Role } from '@/types';

const ROLE_BADGE: Record<Role, string> = {
  owner: 'bg-primary-soft text-primary',
  admin: 'bg-primary-soft text-primary',
  manager: 'bg-accent-soft text-accent-dark',
  member: 'bg-slate-100 text-muted',
};

interface NavItem {
  label: string;
  to: string;
  end?: boolean;
  icon: LucideIcon;
  visible?: (role: Role) => boolean;
}

const NAV: NavItem[] = [
  { label: 'Basic info', to: '/profile', end: true, icon: UserCircle2 },
  { label: 'Assigned projects', to: '/profile/assigned-projects', icon: Briefcase },
  {
    label: 'Assigned people',
    to: '/profile/assigned-people',
    icon: Users,
    visible: (role) => role === 'owner' || role === 'admin' || role === 'manager',
  },
  { label: 'Permissions', to: '/profile/permissions', icon: ShieldCheck },
  { label: 'Notifications', to: '/profile/notifications', icon: Bell },
];

interface Props {
  title: string;
  children: React.ReactNode;
  /** Optional override; defaults to fresh GET /auth/me/profile/. */
  profile?: MyProfile | null;
}

export default function ProfileLayout({ title, children, profile: profileProp }: Props) {
  const authUser = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<MyProfile | null>(profileProp ?? null);

  useEffect(() => {
    if (profileProp) {
      setProfile(profileProp);
      return;
    }
    let cancelled = false;
    getMyProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profileProp]);

  const role: Role = (profile?.role ?? authUser?.role ?? 'member') as Role;
  const initial = (profile?.full_name?.[0] ?? authUser?.full_name?.[0] ?? authUser?.email?.[0] ?? 'U').toUpperCase();
  const displayName = profile?.full_name ?? authUser?.full_name ?? authUser?.email ?? '';
  const email = profile?.email ?? authUser?.email ?? '';

  const visibleNav = NAV.filter((i) => !i.visible || i.visible(role));

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="pb-6 pt-8 sm:pt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Your account
          </p>
          <h1 className="mt-1 font-heading text-3xl font-bold text-text sm:text-[2rem]">
            {title}
          </h1>
        </header>

        <div className="grid grid-cols-1 gap-8 pb-16 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {/* Profile plaque */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark font-heading text-lg font-bold text-white shadow-sm">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-sm font-bold text-text">{displayName}</p>
                  <p className="truncate text-xs text-muted">{email}</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ROLE_BADGE[role]}`}
                  >
                    {role}
                  </span>
                </div>
              </div>
            </div>

            {/* Sidebar nav */}
            <nav className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <ul className="space-y-1">
                {visibleNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
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
                              {item.label}
                            </span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
