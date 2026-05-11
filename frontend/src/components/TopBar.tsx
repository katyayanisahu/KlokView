import { Menu, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import UserMenu from '@/components/UserMenu';
import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/types';

interface TopBarProps {
  onOpenNav: () => void;
}

export default function TopBar({ onOpenNav }: TopBarProps) {
  const navigate = useNavigate();
  const role: Role = (useAuthStore((s) => s.user?.role) ?? 'member') as Role;
  const canInvite = role === 'owner' || role === 'admin';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-white/5 bg-[#0B1F3F] px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-blue-100 transition hover:bg-white/10 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="ml-auto flex items-center gap-3">
        {canInvite ? (
          <button
            type="button"
            onClick={() => navigate('/team/invite')}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-text shadow-sm transition hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <UserPlus className="h-4 w-4" />
            <span>
              Invite<span className="hidden sm:inline"> teammate</span>
            </span>
          </button>
        ) : null}
        <UserMenu variant="on-dark" />
      </div>
    </header>
  );
}
