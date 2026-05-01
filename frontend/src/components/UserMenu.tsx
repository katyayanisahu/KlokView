import { useState } from 'react';
import { ChevronDown, LogOut, Settings } from 'lucide-react';

import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/types';

interface UserMenuProps {
  variant?: 'on-dark' | 'on-light';
}

export default function UserMenu({ variant = 'on-dark' }: UserMenuProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);

  const role: Role = user?.role ?? 'member';
  const initial = (user?.full_name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase();
  const displayName = user?.full_name ?? user?.email ?? 'Guest';
  const firstName = displayName.split(' ')[0];
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const triggerClass =
    variant === 'on-dark'
      ? 'inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 py-1 pl-1 pr-3 text-left transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-accent/40'
      : 'inline-flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-left shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30';

  const nameClass =
    variant === 'on-dark'
      ? 'block truncate text-sm font-semibold leading-tight text-white'
      : 'block truncate text-sm font-semibold leading-tight text-text';

  const roleClass =
    variant === 'on-dark'
      ? 'block text-[11px] leading-tight text-blue-100/80'
      : 'block text-[11px] leading-tight text-muted';

  const chevronClass =
    variant === 'on-dark' ? 'text-blue-100/80' : 'text-muted';

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={triggerClass}>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-white">
          {initial}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className={nameClass}>{firstName}</span>
          <span className={roleClass}>{roleLabel}</span>
        </span>
        <ChevronDown className={`h-4 w-4 transition ${chevronClass} ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white text-text shadow-lg">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-muted">{user?.email ?? ''}</p>
              <span className="mt-1 inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold capitalize text-primary">
                {role}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm transition hover:bg-bg"
            >
              <Settings className="h-4 w-4 text-muted" />
              Profile settings
            </button>
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
