import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import ProfileLayout from './ProfileLayout';
import { getMyAssignedProjects } from '@/api/profile';
import { extractApiError } from '@/utils/errors';
import type { MyProfileProjectMembership, Role } from '@/types';
import { useAuthStore } from '@/store/authStore';

function intro(role: Role): string {
  if (role === 'owner') {
    return 'As the workspace Owner, you have access to all projects, but can only track time and expenses to the projects you are assigned.';
  }
  if (role === 'admin') {
    return 'As an Administrator, you have access to all projects, but can only track time and expenses to the projects you are assigned.';
  }
  return 'You can track time and expenses on the projects below.';
}

export default function AssignedProjectsTab() {
  const role: Role = (useAuthStore((s) => s.user?.role) ?? 'member') as Role;
  const [projects, setProjects] = useState<MyProfileProjectMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyAssignedProjects()
      .then((p) => {
        if (!cancelled) setProjects(p);
      })
      .catch((e) => setError(extractApiError(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = role === 'owner' || role === 'admin';

  return (
    <ProfileLayout title="Your assigned projects">
      <p className="mb-4 text-sm text-muted">{intro(role)}</p>

      {error ? (
        <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      ) : null}

      {projects === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">
          Loading…
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">
          You are not assigned to any projects yet. Once you are added, projects will appear here.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Project manager</th>
                  <th className="px-4 py-3 text-right">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((p) => (
                  <tr key={p.project_id} className={p.is_active === false ? 'bg-slate-50/50 text-muted' : ''}>
                    <td className="px-4 py-3">
                      <Link
                        to={`/projects/${p.project_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.project_name}
                      </Link>
                      {p.is_active === false ? (
                        <span className="ml-2 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                          Archived
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-text">{p.client_name || '—'}</td>
                    <td className="px-4 py-3">
                      {p.is_project_manager ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-dark">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-muted">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/projects/${p.project_id}`}
                        className="whitespace-nowrap text-xs font-semibold text-primary hover:underline"
                      >
                        Open project →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Project manager assignments are set by an admin from each project&rsquo;s Team tab.
            {isAdmin
              ? ' Open a project above to change them.'
              : ' Ask an admin if this needs to change.'}
          </p>
        </>
      )}
    </ProfileLayout>
  );
}
