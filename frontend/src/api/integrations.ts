import api from './client';

export interface OutlookStatus {
  connected: boolean;
  email: string | null;
  connected_at: string | null;
  configured: boolean;
}

export interface OutlookEvent {
  outlook_event_id: string;
  subject: string;
  start: string;
  end: string;
  duration_hours: number;
  body_preview?: string;
  organizer?: string;
  web_link?: string;
  already_imported: boolean;
}

export async function getOutlookStatus(): Promise<OutlookStatus> {
  const { data } = await api.get<OutlookStatus>('/integrations/outlook/status/');
  return data;
}

export async function startOutlookOAuth(): Promise<{ authorize_url: string }> {
  const { data } = await api.get<{ authorize_url: string }>('/integrations/outlook/oauth/start/');
  return data;
}

export async function disconnectOutlook(): Promise<void> {
  await api.delete('/integrations/outlook/disconnect/');
}

export async function listOutlookEvents(date: string): Promise<OutlookEvent[]> {
  const { data } = await api.get<OutlookEvent[]>('/integrations/outlook/events/', { params: { date } });
  return data;
}

export interface MarkImportedPayload {
  outlook_event_id: string;
  time_entry_id?: number;
  subject?: string;
  event_start?: string;
  event_end?: string;
}

export async function markOutlookEventImported(payload: MarkImportedPayload): Promise<void> {
  await api.post('/integrations/outlook/events/mark-imported/', payload);
}

// ----- Jira (Epic 7) -----

export interface JiraStatus {
  connected: boolean;
  base_url: string | null;
  connected_at: string | null;
}

export async function getJiraStatus(): Promise<JiraStatus> {
  const { data } = await api.get<JiraStatus>('/integrations/jira/status/');
  return data;
}

export async function claimJiraConnection(client_key: string): Promise<JiraStatus> {
  const { data } = await api.post<JiraStatus>('/integrations/jira/claim/', { client_key });
  return data;
}

export async function disconnectJira(): Promise<void> {
  await api.delete('/integrations/jira/disconnect/');
}
