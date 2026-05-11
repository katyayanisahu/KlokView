import { AlertTriangle, Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import ProfileLayout from './ProfileLayout';
import { getMyProfile } from '@/api/profile';
import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import { useAuthStore } from '@/store/authStore';
import type { MyProfile, Role } from '@/types';

interface PermissionRow {
  role: Role;
  label: string;
  description: string;
}

const ROLES: PermissionRow[] = [
  {
    role: 'member',
    label: 'Member',
    description: 'Good for people who just need to track time and submit timesheets.',
  },
  {
    role: 'manager',
    label: 'Manager',
    description:
      'Good for people who need more access to people and project reports. Managers can approve and run reports for time tracked to selected projects and people.',
  },
  {
    role: 'admin',
    label: 'Administrator',
    description:
      'Good for people who need the most control to manage your account. Administrators can see and do everything: create and manage all projects and people, see all reports, and more.',
  },
  {
    role: 'owner',
    label: 'Owner',
    description:
      'The Account Owner has full administrator access plus the ability to transfer ownership and delete the workspace. Only one person can be the Owner.',
  },
];

const MODULES: Array<{ key: string; label: string }> = [
  { key: 'time_tracking', label: 'Time tracking' },
  { key: 'team', label: 'Team management' },
  { key: 'timesheet_approval', label: 'Timesheet approvals' },
  { key: 'reports', label: 'Reports' },
  { key: 'activity_log', label: 'Activity log' },
  { key: 'jira_sync', label: 'Jira sync' },
  { key: 'outlook_sync', label: 'Outlook sync' },
];

export default function PermissionsTab() {
  const role: Role = (useAuthStore((s) => s.user?.role) ?? 'member') as Role;
  const isOwner = role === 'owner';
  const isModuleEnabled = useAccountSettingsStore((s) => s.isModuleEnabled);
  const [profile, setProfile] = useState<MyProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ProfileLayout title="Your permissions" profile={profile}>
      <p className="mb-4 text-sm text-muted">
        This determines what you can see and do in this account.{' '}
        <a
          href="https://klokview.example.com/help/permissions"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Learn more about what people can access
        </a>
        .
      </p>

      {isOwner ? (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            You are the <strong>Account Owner</strong>. You cannot change your own permissions —
            transfer ownership first from <strong>Settings → Preferences</strong>.
          </p>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-heading text-lg font-bold text-text">Permission level</h2>
        <ul className="space-y-4">
          {ROLES.map((r) => {
            const isMine = r.role === role;
            return (
              <li
                key={r.role}
                className={`flex items-start gap-3 rounded-lg border p-4 ${
                  isMine ? 'border-primary bg-primary-soft/30' : 'border-slate-200 bg-white'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    isMine ? 'border-primary bg-primary' : 'border-slate-300 bg-white'
                  }`}
                >
                  {isMine ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                </span>
                <div>
                  <p className="font-semibold text-text">
                    {r.label}
                    {isMine ? (
                      <span className="ml-2 inline-flex rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                        Your role
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-muted">{r.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 font-heading text-lg font-bold text-text">Workspace modules</h2>
        <p className="mb-4 text-sm text-muted">
          Module access is controlled at the workspace level by an owner or admin under{' '}
          <strong>Settings → Modules</strong>.
        </p>
        <ul className="divide-y divide-slate-100">
          {MODULES.map((m) => {
            const enabled = isModuleEnabled(m.key as Parameters<typeof isModuleEnabled>[0], true);
            return (
              <li key={m.key} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-text">{m.label}</span>
                {enabled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-dark">
                    <Check className="h-3.5 w-3.5" />
                    Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-muted">
                    <X className="h-3.5 w-3.5" />
                    Disabled
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </ProfileLayout>
  );
}
