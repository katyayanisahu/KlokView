import { BarChart3 } from 'lucide-react';

import ComingSoon from '@/components/ComingSoon';
import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/types';

const COPY: Record<Role, { title: string; description: string }> = {
  owner: {
    title: 'Reports',
    description:
      'Team-wide time reports across all projects, clients, and people. Export CSV and visualize trends with charts.',
  },
  admin: {
    title: 'Reports',
    description:
      'Team-wide time reports across all projects, clients, and people. Export CSV and visualize trends with charts.',
  },
  manager: {
    title: 'Reports',
    description:
      'Time reports for the projects and people you manage, plus your own time. Export CSV and approve hours.',
  },
  member: {
    title: 'My reports',
    description:
      'Your tracked time across projects and tasks. View by day, week, or custom date range and export to CSV.',
  },
};

export default function ReportsPage() {
  const role: Role = useAuthStore((s) => s.user?.role) ?? 'member';
  const copy = COPY[role];

  return <ComingSoon icon={BarChart3} title={copy.title} description={copy.description} />;
}
