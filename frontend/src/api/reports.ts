import api from './client';

export interface ProfitabilityRow {
  id: number | null;
  name: string;
  client?: string;
  type?: string;
  revenue: string;
  cost: string;
  profit: string;
  hours: string;
  margin: number;
  return_on_cost: number;
  has_missing_data: boolean;
}

export interface ProfitabilityReport {
  window: { start: string; end: string };
  totals: {
    revenue: string;
    cost: string;
    profit: string;
    margin_percent: number;
  };
  clients: ProfitabilityRow[];
  projects: ProfitabilityRow[];
  team: ProfitabilityRow[];
  tasks: ProfitabilityRow[];
}

export async function getProfitabilityReport(params?: {
  start?: string;
  end?: string;
  project_status?: 'active' | 'archived' | '';
  project_type?: 'time_materials' | 'fixed_fee' | 'non_billable' | '';
  project_manager_id?: number;
  client_id?: number;
  project_id?: number;
}): Promise<ProfitabilityReport> {
  const { data } = await api.get<ProfitabilityReport>('/reports/profitability/', {
    params,
  });
  return data;
}

export interface TimeReportRow {
  id: number | null;
  name: string;
  hours: string;
  billable_hours: string;
  billable_percent: number;
  billable_amount?: string;
  client_id?: number | null;
  client_name?: string;
  type?: string;
  initials?: string;
  utilization?: number;
}

export interface TaskBreakdownMember {
  user_id: number;
  name: string;
  initials: string;
  role?: string;
  hours: string;
  billable_hours: string;
  billable_percent: number;
  rate: string;
  cost_rate?: string;
  billable_amount: string;
  cost?: string;
}

export interface TaskBreakdownRow {
  id: number;
  name: string;
  hours: string;
  billable_hours: string;
  billable_percent: number;
  billable_amount: string;
  cost?: string;
  members: TaskBreakdownMember[];
}

export interface TeamBreakdownTask {
  task_id: number;
  name: string;
  hours: string;
  billable_hours: string;
  billable_percent: number;
  billable_amount: string;
  cost: string;
}

export interface TeamBreakdownRow {
  id: number;
  name: string;
  initials: string;
  hours: string;
  billable_hours: string;
  billable_percent: number;
  billable_amount: string;
  cost: string;
  tasks: TeamBreakdownTask[];
}

export interface TimeReport {
  window: { start: string; end: string };
  totals: {
    total_hours: string;
    billable_hours: string;
    non_billable_hours: string;
    billable_percent: number;
    billable_amount?: string;
  };
  clients: TimeReportRow[];
  projects: TimeReportRow[];
  team: TimeReportRow[];
  tasks: TimeReportRow[];
  task_breakdown?: TaskBreakdownRow[];
  team_breakdown?: TeamBreakdownRow[];
}

export async function getTimeReport(params?: {
  start?: string;
  end?: string;
  active_only?: boolean;
  project_id?: number;
  client_id?: number;
}): Promise<TimeReport> {
  const { data } = await api.get<TimeReport>('/reports/time/', { params });
  return data;
}

export type ActivityType = 'timesheet' | 'approval' | 'project';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  when: string;
  date_label: string;
  time_label: string;
  activity: string;
  hours?: string;
  entry_date?: string | null;
  entry_date_label?: string;
  client: string;
  project: string;
  project_id?: number | null;
  task: string;
  performed_by: string;
  performer_id?: number | null;
}

export interface ActivityLogReport {
  window: { start: string; end: string };
  events: ActivityEvent[];
}

export async function getActivityLog(params?: {
  start?: string;
  end?: string;
  type?: ActivityType | '';
}): Promise<ActivityLogReport> {
  const { data } = await api.get<ActivityLogReport>('/reports/activity/', { params });
  return data;
}

// ---- Saved Reports ----

export type SavedReportKind = 'time' | 'profitability' | 'detailed_time' | 'activity';

export interface SavedReport {
  id: number;
  name: string;
  kind: SavedReportKind;
  filters: Record<string, unknown>;
  is_shared: boolean;
  owner: number;
  owner_name: string;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedReportCreatePayload {
  name: string;
  kind: SavedReportKind;
  filters?: Record<string, unknown>;
  is_shared?: boolean;
}

export async function listSavedReports(params?: {
  kind?: SavedReportKind;
  scope?: 'mine' | 'shared' | 'all';
}): Promise<SavedReport[]> {
  const { data } = await api.get<SavedReport[] | { results: SavedReport[] }>(
    '/reports/saved/',
    { params },
  );
  return Array.isArray(data) ? data : data.results;
}

export async function createSavedReport(
  payload: SavedReportCreatePayload,
): Promise<SavedReport> {
  const { data } = await api.post<SavedReport>('/reports/saved/', payload);
  return data;
}

export async function deleteSavedReport(id: number): Promise<void> {
  await api.delete(`/reports/saved/${id}/`);
}
