import { Outlet } from 'react-router-dom';

import PageHero from '@/components/PageHero';
import ReportsSubnav from '@/components/ReportsSubnav';

export default function ReportsLayout() {
  return (
    <div className="min-h-screen bg-bg">
      <PageHero
        title="Reports"
        description="Time, audit insights across your team — all your numbers in one place."
      />
      <ReportsSubnav />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
