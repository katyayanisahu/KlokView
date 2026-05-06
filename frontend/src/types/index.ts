export type Role = 'owner' | 'admin' | 'manager' | 'member';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  hourly_rate: number;
  avatar_url?: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | Record<string, unknown> | null;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

export interface RegisterResponse extends AuthTokens {
  user: User;
}

export type InviteRole = 'admin' | 'manager' | 'member';

export interface InviteCreatePayload {
  first_name: string;
  last_name: string;
  email: string;
  role?: InviteRole;
  employee_id?: string;
  weekly_capacity_hours?: number | string;
  job_role_ids?: number[];
}

export interface InviteUpdatePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  role?: InviteRole;
  employee_id?: string;
  weekly_capacity_hours?: number | string;
  hourly_rate?: number | string;
  cost_rate?: number | string;
  job_role_ids?: number[];
  is_active?: boolean;
}

export type TeamMemberUpdatePayload = InviteUpdatePayload;

export interface AssignProjectsPayload {
  project_ids: number[];
  manages_project_ids: number[];
}

export interface InviteCreateResponse {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  invited_at: string | null;
  is_active: boolean;
  employee_id: string;
  weekly_capacity_hours: string;
  job_role_ids: number[];
  job_role_names: string[];
  invite_url?: string;
}

export interface TeamMember {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  avatar_url: string;
  employee_id: string;
  weekly_capacity_hours: string;
  job_role_names: string[];
  job_role_ids: number[];
  project_count: number;
  is_active: boolean;
  invited_at: string | null;
  is_pending_invite: boolean;
  tracked_hours_this_week?: string;
  billable_hours_this_week?: string;
}

export interface TeamMemberProjectMembership {
  project_id: number;
  project_name: string;
  client_name: string;
  is_project_manager: boolean;
}

export interface TeamMemberDetail extends TeamMember {
  project_memberships: TeamMemberProjectMembership[];
  hourly_rate?: string;
  cost_rate?: string;
}

export type InviteInvalidReason = 'expired' | 'not_found' | 'already_used';

export interface InviteValidateValid {
  isValid: true;
  firstName: string;
  lastName: string;
  email: string;
  accountName: string;
}

export interface InviteValidateInvalid {
  isValid: false;
  reason: InviteInvalidReason;
}

export type InviteValidateResponse = InviteValidateValid | InviteValidateInvalid;

export interface InviteAcceptPayload {
  token: string;
  password: string;
  confirm_password: string;
}

export interface InviteAcceptResponse extends AuthTokens {
  user: User;
}

// ---- Clients / Projects / Tasks ----

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ClientContact {
  id: number;
  client: number;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  office_number: string;
  mobile_number: string;
  fax_number: string;
  created_at: string;
  updated_at: string;
}

export interface ClientContactPayload {
  client: number;
  first_name: string;
  last_name?: string;
  email?: string;
  title?: string;
  office_number?: string;
  mobile_number?: string;
  fax_number?: string;
}

export interface Client {
  id: number;
  name: string;
  address: string;
  currency: string;
  invoice_due_date_type: 'custom' | 'net_15' | 'net_30' | 'upon_receipt';
  tax_rate: string | null;
  discount_rate: string | null;
  is_active: boolean;
  active_project_count: number;
  contacts: ClientContact[];
  created_at: string;
  updated_at: string;
}

export interface ClientCreatePayload {
  name: string;
  address?: string;
  currency?: string;
  invoice_due_date_type?: Client['invoice_due_date_type'];
  tax_rate?: string | null;
  discount_rate?: string | null;
}

export type ProjectType = 'time_materials' | 'fixed_fee' | 'non_billable';
export type BudgetType = 'none' | 'total_fees' | 'total_hours' | 'hours_per_task' | 'fees_per_task';
export type ProjectVisibility = 'admins_and_managers' | 'everyone';
export type BillableRateStrategy = 'person' | 'task' | 'project' | 'none';

export interface ProjectListItem {
  id: number;
  name: string;
  code: string;
  client_id: number;
  client_name: string;
  project_type: ProjectType;
  budget_type: BudgetType;
  budget_amount: string | null;
  billable_rate_strategy?: BillableRateStrategy;
  flat_billable_rate?: string | null;
  manager_ids: number[];
  spent_amount?: string | null;
  costs_amount?: string | null;
  cost_amount?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Task {
  id: number;
  name: string;
  is_default: boolean;
  default_is_billable: boolean;
  default_billable_rate: string | null;
  is_active: boolean;
}

export interface TaskCreatePayload {
  name: string;
  is_default?: boolean;
  default_is_billable?: boolean;
  default_billable_rate?: string | null;
}

export interface JobRoleAssignedUser {
  id: number;
  full_name: string;
  email: string;
  avatar_url: string;
}

export interface JobRole {
  id: number;
  name: string;
  people_count: number;
  assigned_users: JobRoleAssignedUser[];
  created_at: string;
  updated_at: string;
}

export interface ProjectTaskEntry {
  id: number;
  task_name: string;
  is_billable: boolean;
  hours_logged?: string;
}

export interface ProjectMemberEntry {
  id: number;
  user: {
    id: number;
    email: string;
    full_name: string;
    role: Role;
  };
  hourly_rate: string | null;
  is_project_manager: boolean;
  hours_logged?: string;
}

export interface ProjectDetail {
  id: number;
  name: string;
  code: string;
  client_id: number;
  client_name: string;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  visibility: ProjectVisibility;
  project_type: ProjectType;
  budget_type: BudgetType;
  budget_amount: string | null;
  budget_resets_monthly: boolean;
  budget_includes_non_billable: boolean;
  budget_alert_percent: number | null;
  billable_rate_strategy?: BillableRateStrategy;
  flat_billable_rate?: string | null;
  is_active: boolean;
  project_tasks: ProjectTaskEntry[];
  memberships: ProjectMemberEntry[];
  total_hours_logged?: string;
  billable_hours_logged?: string;
  non_billable_hours_logged?: string;
  hours_this_week?: string;
  avg_hours_per_week?: string;
  created_at: string;
  updated_at: string;
}

// ---- Time entries ----

export interface TimeEntry {
  id: number;
  user_id: number;
  user_name: string;
  project_id: number;
  project_name: string;
  client_name: string;
  project_task_id: number;
  task_name: string;
  date: string; // YYYY-MM-DD
  hours: string; // decimal string, e.g. "1.50"
  notes: string;
  is_billable: boolean;
  jira_issue_key: string;
  is_running: boolean;
  started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryCreatePayload {
  project_id: number;
  project_task_id: number;
  date: string;
  hours: string | number;
  notes?: string;
  is_billable?: boolean;
  jira_issue_key?: string;
}

export interface TimeEntryUpdatePayload {
  project_id?: number;
  project_task_id?: number;
  date?: string;
  hours?: string | number;
  notes?: string;
  is_billable?: boolean;
  jira_issue_key?: string;
}

export interface TimeEntryListParams {
  date?: string;
  start_date?: string;
  end_date?: string;
  project_id?: number;
  user_id?: number;
  client_id?: number;
  task_id?: number;
  is_billable?: boolean;
  active_only?: boolean;
  search?: string;
}

// ---- Submissions (Epic 6) ----

export type SubmissionStatus = 'submitted' | 'approved' | 'rejected';

export interface Submission {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  start_date: string;
  end_date: string;
  status: SubmissionStatus;
  submitted_at: string;
  decided_at: string | null;
  decided_by: number | null;
  decided_by_name: string | null;
  decision_note: string;
  total_hours: string;
  billable_hours: string;
  entry_count: number;
  created_at: string;
  updated_at: string;
}

export interface SubmissionCreatePayload {
  start_date: string;
  end_date: string;
}

export interface SubmissionDecisionPayload {
  decision_note?: string;
}

export interface SubmissionListParams {
  user_id?: number;
  status?: SubmissionStatus;
  start_date?: string;
  end_date?: string;
}

export interface ProjectCreatePayload {
  name: string;
  client_id: number;
  code?: string;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string;
  visibility?: ProjectVisibility;
  project_type?: ProjectType;
  budget_type?: BudgetType;
  budget_amount?: string | null;
  budget_resets_monthly?: boolean;
  budget_includes_non_billable?: boolean;
  budget_alert_percent?: number | null;
  billable_rate_strategy?: BillableRateStrategy;
  flat_billable_rate?: string | null;
  task_ids?: number[];
  members?: Array<{ user_id: number; hourly_rate?: string | null; is_project_manager?: boolean }>;
}

export interface ProjectTaskEntryFull {
  id: number;
  task_name: string;
  is_billable: boolean;
  billable_rate: string | null;
  hours_logged?: string;
}
