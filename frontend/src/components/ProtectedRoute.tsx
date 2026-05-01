import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { useAuthStore } from '@/store/authStore';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const location = useLocation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const user = useAuthStore((s) => s.user);
  const [navOpen, setNavOpen] = useState(false);

  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isHydrating && !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar mobileOpen={navOpen} onCloseMobile={() => setNavOpen(false)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        {children}
      </div>
    </div>
  );
}
