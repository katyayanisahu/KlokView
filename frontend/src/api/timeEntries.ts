import api from './client';
import type {
  Paginated,
  TimeEntry,
  TimeEntryCreatePayload,
  TimeEntryListParams,
  TimeEntryUpdatePayload,
} from '@/types';

export async function listTimeEntries(
  params?: TimeEntryListParams,
): Promise<TimeEntry[]> {
  const { data } = await api.get<Paginated<TimeEntry> | TimeEntry[]>(
    '/time-entries/',
    { params },
  );
  return Array.isArray(data) ? data : data.results;
}

export async function createTimeEntry(
  payload: TimeEntryCreatePayload,
): Promise<TimeEntry> {
  const { data } = await api.post<TimeEntry>('/time-entries/', payload);
  return data;
}

export async function updateTimeEntry(
  id: number,
  payload: TimeEntryUpdatePayload,
): Promise<TimeEntry> {
  const { data } = await api.patch<TimeEntry>(`/time-entries/${id}/`, payload);
  return data;
}

export async function deleteTimeEntry(id: number): Promise<void> {
  await api.delete(`/time-entries/${id}/`);
}

export async function getRunningEntry(): Promise<TimeEntry | null> {
  const { data } = await api.get<TimeEntry | null>('/time-entries/running/');
  return data ?? null;
}

export interface StartTimerPayload {
  project_id: number;
  project_task_id: number;
  date: string;
  notes?: string;
  is_billable?: boolean;
  jira_issue_key?: string;
}

export async function startTimer(payload: StartTimerPayload): Promise<TimeEntry> {
  const { data } = await api.post<TimeEntry>('/time-entries/start/', payload);
  return data;
}

export async function stopTimer(id: number): Promise<TimeEntry> {
  const { data } = await api.post<TimeEntry>(`/time-entries/${id}/stop/`);
  return data;
}

export async function resumeTimer(id: number): Promise<TimeEntry> {
  const { data } = await api.post<TimeEntry>(`/time-entries/${id}/resume/`);
  return data;
}
