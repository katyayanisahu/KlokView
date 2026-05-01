import api from './client';
import type { JobRole, Paginated } from '@/types';

interface JobRolePayload {
  name: string;
  assigned_user_ids?: number[];
}

export async function listJobRoles(): Promise<JobRole[]> {
  const { data } = await api.get<Paginated<JobRole> | JobRole[]>('/auth/job-roles/');
  if (Array.isArray(data)) return data;
  return data.results;
}

export async function createJobRole(payload: JobRolePayload): Promise<JobRole> {
  const { data } = await api.post<JobRole>('/auth/job-roles/', payload);
  return data;
}

export async function updateJobRole(id: number, payload: JobRolePayload): Promise<JobRole> {
  const { data } = await api.patch<JobRole>(`/auth/job-roles/${id}/`, payload);
  return data;
}

export async function deleteJobRole(id: number): Promise<void> {
  await api.delete(`/auth/job-roles/${id}/`);
}
