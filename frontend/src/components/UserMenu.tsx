import { useState } from 'react';
import { Bell, ChevronDown, FileBarChart, Gift, LogOut, UserCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/types';

interface UserMenuProps {
  variant?: 'on-dark' | 'on-light';
}

export default function UserMenu({ variant = 'on-dark' }: UserMenuProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const role: Role = user?.role ?? 'member';
  const initial = (user?.full_name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase();
  const displayName = user?.full_name ?? user?.email ?? 'Guest';
  const firstName = displayName.split(' ')[0];

  const triggerClass =
    variant === 'on-dark'
      ? 'inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2 text-left shadow-md transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent/40 sm:gap-2.5 sm:pr-3'
      : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 text-left shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:gap-2.5 sm:pr-3';

  const nameClass = 'truncate text-sm font-semibold text-text';

  const chevronClass = 'text-muted';

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={triggerClass}>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-white">
          {initial}
        </span>
        <span className={`hidden sm:inline ${nameClass}`}>{firstName}</span>
        <ChevronDown className={`h-4 w-4 transition ${chevronClass} ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white text-text shadow-lg">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-muted">{user?.email ?? ''}</p>
              <span className="mt-1 inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold capitalize text-primary">
                {role}
              </span>
            </div>
            <button
              type="button"
              onClick={() => go('/profile')}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm transition hover:bg-bg"
            >
              <UserCircle2 className="h-4 w-4 text-muted" />
              My profile
            </button>
            <button
              type="button"
              onClick={() => go(user?.id ? `/reports/detailed-time?user_id=${user.id}` : '/reports/detailed-time')}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm transition hover:bg-bg"
            >
              <FileBarChart className="h-4 w-4 text-muted" />
              My time report
            </button>
            <button
              type="button"
              onClick={() => go('/profile/notifications')}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm transition hover:bg-bg"
            >
              <Bell className="h-4 w-4 text-muted" />
              Notifications
            </button>
            <button
              type="button"
              onClick={() => go('/profile/refer')}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm transition hover:bg-bg"
            >
              <Gift className="h-4 w-4 text-muted" />
              Refer a friend
            </button>
            <div className="border-t border-slate-100" />
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger transition hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
