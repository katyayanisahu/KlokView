import api from './client';
import type {
  Paginated,
  ProjectCreatePayload,
  ProjectDetail,
  ProjectListItem,
  ProjectMemberEntry,
  ProjectTaskEntry,
  ProjectType,
  Task,
  TaskCreatePayload,
} from '@/types';

export interface ProjectFilters {
  is_active?: boolean;
  client_id?: number;
  manager_id?: number;
  project_type?: ProjectType;
  search?: string;
}

export async function listProjects(filters?: ProjectFilters): Promise<Paginated<ProjectListItem>> {
  const { data } = await api.get<Paginated<ProjectListItem>>('/projects/', { params: filters });
  return data;
}

export async function getProject(id: number): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail>(`/projects/${id}/`);
  return data;
}

export async function createProject(payload: ProjectCreatePayload): Promise<ProjectDetail> {
  const { data } = await api.post<ProjectDetail>('/projects/', payload);
  return data;
}

export async function updateProject(
  id: number,
  payload: Partial<ProjectCreatePayload>,
): Promise<ProjectDetail> {
  const { data } = await api.patch<ProjectDetail>(`/projects/${id}/`, payload);
  return data;
}

export async function archiveProject(id: number): Promise<{ detail: string }> {
  const { data } = await api.delete<{ detail: string }>(`/projects/${id}/`);
  return data;
}

export async function deleteProject(id: number): Promise<{ detail: string }> {
  const { data } = await api.delete<{ detail: string }>(`/projects/${id}/?hard=true`);
  return data;
}

export async function restoreProject(id: number): Promise<ProjectDetail> {
  const { data } = await api.post<ProjectDetail>(`/projects/${id}/restore/`);
  return data;
}

export async function duplicateProject(id: number): Promise<ProjectDetail> {
  const { data } = await api.post<ProjectDetail>(`/projects/${id}/duplicate/`);
  return data;
}

export async function listProjectTasks(projectId: number): Promise<ProjectTaskEntry[]> {
  const { data } = await api.get<ProjectTaskEntry[]>(`/projects/${projectId}/tasks/`);
  return data;
}

export async function addProjectTask(
  projectId: number,
  payload: { task_id: number; is_billable?: boolean },
): Promise<ProjectTaskEntry> {
  const { data } = await api.post<ProjectTaskEntry>(`/projects/${projectId}/tasks/`, payload);
  return data;
}

export async function removeProjectTask(projectId: number, taskId: number): Promise<void> {
  await api.delete(`/projects/${projectId}/tasks/${taskId}/`);
}

export async function listProjectMembers(projectId: number): Promise<ProjectMemberEntry[]> {
  const { data } = await api.get<ProjectMemberEntry[]>(`/projects/${projectId}/members/`);
  return data;
}

export async function addProjectMember(
  projectId: number,
  payload: { user_id: number; hourly_rate?: string | null; is_project_manager?: boolean },
): Promise<ProjectMemberEntry> {
  const { data } = await api.post<ProjectMemberEntry>(`/projects/${projectId}/members/`, payload);
  return data;
}

export async function removeProjectMember(projectId: number, userId: number): Promise<void> {
  await api.delete(`/projects/${projectId}/members/${userId}/`);
}

export async function listTasks(params?: { is_active?: boolean; search?: string }): Promise<Paginated<Task>> {
  const { data } = await api.get<Paginated<Task>>('/tasks/', { params });
  return data;
}

export async function createTask(payload: TaskCreatePayload): Promise<Task> {
  const { data } = await api.post<Task>('/tasks/', payload);
  return data;
}

export async function updateTask(id: number, payload: Partial<TaskCreatePayload>): Promise<Task> {
  const { data } = await api.patch<Task>(`/tasks/${id}/`, payload);
  return data;
}

export async function archiveTask(id: number): Promise<{ detail: string }> {
  const { data } = await api.delete<{ detail: string }>(`/tasks/${id}/`);
  return data;
}

export async function deleteTask(id: number): Promise<{ detail: string }> {
  const { data } = await api.delete<{ detail: string }>(`/tasks/${id}/?hard=true`);
  return data;
}

export async function restoreTask(id: number): Promise<Task> {
  const { data } = await api.post<Task>(`/tasks/${id}/restore/`);
  return data;
}
