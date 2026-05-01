import { Navigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';

interface Props {
  children: React.ReactNode;
}

export default function PublicOnlyRoute({ children }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
