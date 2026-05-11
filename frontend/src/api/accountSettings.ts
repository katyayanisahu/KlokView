import api from './client';
import type { ApiEnvelope } from '@/types';

export type WeekStart = 'monday' | 'sunday';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type TimeFormat = '12h' | '24h';
export type TimeDisplay = 'hh_mm' | 'decimal';
export type TimerMode = 'duration' | 'start_end';

export interface ModuleFlags {
  time_tracking?: boolean;
  timesheet_approval?: boolean;
  team?: boolean;
  reports?: boolean;
  activity_log?: boolean;
  jira_sync?: boolean;
  outlook_sync?: boolean;
}

export interface EligibleOwner {
  id: number;
  full_name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'member';
}

export interface AccountSettings {
  id: number;
  name: string;
  owner: number | null;
  owner_name: string;
  owner_email: string;
  eligible_owners: EligibleOwner[];
  has_sample_data: boolean;
  // Preferences
  timezone: string;
  fiscal_year_start_month: number;
  week_starts_on: WeekStart;
  default_capacity_hours: string;
  timesheet_deadline: string;
  date_format: DateFormat;
  time_format: TimeFormat;
  time_display: TimeDisplay;
  timer_mode: TimerMode;
  currency: string;
  number_format: string;
  // Modules
  enabled_modules: ModuleFlags;
  // Sign-in security
  require_two_factor: boolean;
  allow_google_sso: boolean;
  allow_microsoft_sso: boolean;
  session_timeout_minutes: number;
  login_alerts: boolean;
  updated_at: string;
}

export type AccountSettingsUpdate = Partial<
  Omit<
    AccountSettings,
    'id' | 'owner_name' | 'owner_email' | 'eligible_owners' | 'has_sample_data' | 'updated_at'
  >
>;

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

export async function getAccountSettings(): Promise<AccountSettings> {
  const { data } = await api.get<ApiEnvelope<AccountSettings>>('/auth/account/settings/');
  return unwrap(data);
}

export async function updateAccountSettings(
  payload: AccountSettingsUpdate,
): Promise<AccountSettings> {
  const { data } = await api.patch<ApiEnvelope<AccountSettings>>(
    '/auth/account/settings/',
    payload,
  );
  return unwrap(data);
}

export interface SampleDataRemovalResult {
  clients_removed: number;
  projects_removed: number;
  time_entries_removed: number;
}

export async function removeSampleData(): Promise<SampleDataRemovalResult> {
  const { data } = await api.post<ApiEnvelope<SampleDataRemovalResult>>(
    '/auth/account/remove-sample-data/',
  );
  return unwrap(data);
}

export interface SampleDataAdditionResult {
  clients_added: number;
  projects_added: number;
  tasks_linked_per_project: number;
}

export async function addSampleData(): Promise<SampleDataAdditionResult> {
  const { data } = await api.post<ApiEnvelope<SampleDataAdditionResult>>(
    '/auth/account/add-sample-data/',
  );
  return unwrap(data);
}
