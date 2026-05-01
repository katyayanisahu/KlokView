import api from './client';
import type {
  ApiEnvelope,
  TeamMember,
  TeamMemberDetail,
  TeamMemberUpdatePayload,
  User,
} from '@/types';

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'success' in (payload as object)) {
    const env = payload as ApiEnvelope<T>;
    if (!env.success || env.data === null) {
      throw new Error(typeof env.error === 'string' ? env.error : 'Request failed');
    }
    return env.data;
  }
  return payload as T;
}

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/auth/users/');
  return data;
}

export async function listTeam(opts?: {
  includePending?: boolean;
  includeArchived?: boolean;
}): Promise<TeamMember[]> {
  const { data } = await api.get<TeamMember[]>('/auth/users/', {
    params: {
      detail: 'team',
      include_pending: opts?.includePending ? 1 : 0,
      include_archived: opts?.includeArchived ? 1 : 0,
    },
  });
  return data;
}

export async function getTeamMember(id: number): Promise<TeamMemberDetail> {
  const { data } = await api.get<ApiEnvelope<TeamMemberDetail>>(`/auth/users/${id}/`);
  return unwrap(data);
}

export async function deleteUser(id: number): Promise<{ detail: string }> {
  const { data } = await api.delete<ApiEnvelope<{ detail: string }>>(
    `/auth/users/${id}/delete/`,
  );
  return unwrap(data);
}

export async function updateTeamMember(
  id: number,
  payload: TeamMemberUpdatePayload,
): Promise<TeamMemberDetail> {
  const { data } = await api.patch<ApiEnvelope<TeamMemberDetail>>(
    `/auth/invites/${id}/`,
    payload,
  );
  return unwrap(data);
}

export async function archiveTeamMember(id: number): Promise<TeamMemberDetail> {
  return updateTeamMember(id, { is_active: false });
}

export async function restoreTeamMember(id: number): Promise<TeamMemberDetail> {
  return updateTeamMember(id, { is_active: true });
}
