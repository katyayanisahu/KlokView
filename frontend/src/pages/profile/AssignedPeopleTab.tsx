import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import ProfileLayout from './ProfileLayout';
import { getMyAssignedPeople } from '@/api/profile';
import { extractApiError } from '@/utils/errors';
import { useAuthStore } from '@/store/authStore';
import type { AssignedPerson, Role } from '@/types';

const ROLE_BADGE: Record<Role, string> = {
  owner: 'bg-primary-soft text-primary',
  admin: 'bg-primary-soft text-primary',
  manager: 'bg-accent-soft text-accent-dark',
  member: 'bg-slate-100 text-muted',
};

export default function AssignedPeopleTab() {
  const role: Role = (useAuthStore((s) => s.user?.role) ?? 'member') as Role;
  const [people, setPeople] = useState<AssignedPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyAssignedPeople()
      .then((p) => {
        if (!cancelled) setPeople(p);
      })
      .catch((e) => setError(extractApiError(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = role === 'owner' || role === 'admin';

  return (
    <ProfileLayout title="Your assigned people">
      {isAdmin ? (
        <div className="rounded-xl bg-slate-100 p-6 text-center text-sm text-muted">
          As an Administrator, you can report on, approve, and edit all people, so you don't need
          to be assigned a specific team.
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            You can approve and report on time entries from the people below.
          </p>

          {error ? (
            <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
          ) : null}

          {people === null ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">
              Loading…
            </div>
          ) : people.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">
              You are not assigned to manage any people yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {people.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3">
                        <Link
                          to={`/team/${p.id}`}
                          className="flex items-center gap-2 font-medium text-primary hover:underline"
                        >
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary font-heading text-xs font-bold text-white">
                            {(p.full_name?.[0] ?? p.email?.[0] ?? '?').toUpperCase()}
                          </span>
                          {p.full_name || p.email}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text">{p.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${ROLE_BADGE[p.role]}`}
                        >
                          {p.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </ProfileLayout>
  );
}
