import { Navigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/types';

interface Props {
  allow: Role[];
  children: React.ReactNode;
}

export default function RequireRole({ allow, children }: Props) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'member';

  if (!allow.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
