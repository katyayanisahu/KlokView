import { AlertTriangle } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';

import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import { useAuthStore } from '@/store/authStore';
import type { ModuleFlags } from '@/api/accountSettings';

interface Props {
  module: keyof ModuleFlags;
  /** Default to `true` while preferences are still loading. */
  defaultEnabled?: boolean;
  children: React.ReactNode;
}

/**
 * Guard a route behind a workspace module flag.
 * Disabled module → owners/admins see an inline notice with a link to re-enable;
 * everyone else gets redirected to the dashboard.
 */
export default function RequireModule({ module, defaultEnabled = true, children }: Props) {
  const settings = useAccountSettingsStore((s) => s.settings);
  const isModuleEnabled = useAccountSettingsStore((s) => s.isModuleEnabled);
  const user = useAuthStore((s) => s.user);

  // While settings haven't loaded yet, render children — avoids a redirect flash.
  if (settings === null) {
    return <>{children}</>;
  }

  if (isModuleEnabled(module, defaultEnabled)) {
    return <>{children}</>;
  }

  // Disabled. Owner/admin gets a recoverable inline notice; everyone else bounces home.
  const canManage = user?.role === 'owner' || user?.role === 'admin';
  if (!canManage) {
    return <Navigate to="/time" replace />;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-lg font-bold">This module is disabled</h1>
            <p className="mt-1 text-sm">
              The <strong>{module.replace(/_/g, ' ')}</strong> module is turned off for this
              workspace. Re-enable it from{' '}
              <Link to="/settings/modules" className="font-semibold underline">
                Settings → Modules
              </Link>{' '}
              to access this page.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
