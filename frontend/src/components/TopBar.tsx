import { Menu } from 'lucide-react';

import UserMenu from '@/components/UserMenu';

interface TopBarProps {
  onOpenNav: () => void;
}

export default function TopBar({ onOpenNav }: TopBarProps) {
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
      <div className="ml-auto">
        <UserMenu variant="on-dark" />
      </div>
    </header>
  );
}
