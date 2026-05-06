// Mock data for the Reports module — mirrors the spec screenshots.
// Will be swapped for real API responses once the backend is wired up.

export interface ClientRow {
  id: number;
  name: string;
  hours: number;
  billableHours: number;
  billableAmount: number;
  uninvoicedAmount: number;
}

export interface ProjectRow {
  id: number;
  name: string;
  clientId: number;
  clientName: string;
  type: 'Time & Materials' | 'Fixed Fee' | 'Non-Billable';
  hours: number;
  billableHours: number;
  billableAmount: number;
}

export interface TaskRow {
  id: number;
  name: string;
  color: string;
  hours: number;
  billableHours: number;
  billableAmount: number;
}

export interface TeamMemberRow {
  id: number;
  name: string;
  initials: string;
  hours: number;
  billableHours: number;
  utilization: number; // percentage
  billableAmount: number;
}

export interface DetailedTimeRow {
  id: number;
  date: string; // ISO yyyy-mm-dd
  user: string;
  client: string;
  project: string;
  task: string;
  role: string;
  description: string;
  hours: number;
  billableRate: number;
  billableAmount: number;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export interface ProfitabilityRow {
  id: number;
  name: string;
  client?: string;
  type?: 'Time & Materials' | 'Fixed Fee' | 'Non-Billable';
  revenue: number;
  cost: number;
  profit: number;
  margin: number; // %
  returnOnCost: number; // %
  hasMissingData?: boolean;
}

export interface ActivityRow {
  id: number;
  time: string; // 12-hour clock label
  date: string; // dd/mm/yyyy label
  activity: string;
  hours?: string;
  client: string;
  project: string;
  task: string;
  performedBy: string;
  type: 'timesheet' | 'approval' | 'project';
}

// ---------- TIME REPORT ----------

export const TIME_CLIENTS: ClientRow[] = [
  {
    id: 1,
    name: '[SAMPLE] Client A',
    hours: 29.68,
    billableHours: 22.33,
    billableAmount: 1482.0,
    uninvoicedAmount: 1482.0,
  },
  {
    id: 2,
    name: '[SAMPLE] Client B',
    hours: 47.54,
    billableHours: 25.76,
    billableAmount: 3997.0,
    uninvoicedAmount: 3997.0,
  },
  {
    id: 3,
    name: 'Example Client',
    hours: 2.87,
    billableHours: 2.87,
    billableAmount: 287.0,
    uninvoicedAmount: 287.0,
  },
];

export const TIME_PROJECTS: ProjectRow[] = [
  {
    id: 11,
    name: '[SAMPLE] Fixed Fee Project',
    clientId: 1,
    clientName: '[SAMPLE] Client A',
    type: 'Fixed Fee',
    hours: 13.73,
    billableHours: 11.61,
    billableAmount: 0,
  },
  {
    id: 12,
    name: '[SAMPLE] Time & Materials Project',
    clientId: 1,
    clientName: '[SAMPLE] Client A',
    type: 'Time & Materials',
    hours: 15.95,
    billableHours: 10.72,
    billableAmount: 1482.0,
  },
  {
    id: 13,
    name: '[SAMPLE] Monthly Retainer',
    clientId: 2,
    clientName: '[SAMPLE] Client B',
    type: 'Time & Materials',
    hours: 30.6,
    billableHours: 18.5,
    billableAmount: 2700.0,
  },
  {
    id: 14,
    name: '[SAMPLE] Non-Billable Project',
    clientId: 2,
    clientName: '[SAMPLE] Client B',
    type: 'Non-Billable',
    hours: 16.94,
    billableHours: 7.26,
    billableAmount: 1297.0,
  },
  {
    id: 15,
    name: 'Example Project',
    clientId: 3,
    clientName: 'Example Client',
    type: 'Time & Materials',
    hours: 2.87,
    billableHours: 2.87,
    billableAmount: 287.0,
  },
];

export const TIME_TASKS: TaskRow[] = [
  { id: 101, name: 'Design', color: '#10B981', hours: 8.54, billableHours: 8.54, billableAmount: 122.5 },
  {
    id: 102,
    name: 'Business Development',
    color: '#F59E0B',
    hours: 7.35,
    billableHours: 0,
    billableAmount: 0,
  },
  { id: 103, name: 'Programming', color: '#EC4899', hours: 6.15, billableHours: 6.15, billableAmount: 820.75 },
  {
    id: 104,
    name: 'Project Management',
    color: '#8B5CF6',
    hours: 4.31,
    billableHours: 4.31,
    billableAmount: 538.75,
  },
  { id: 105, name: 'Marketing', color: '#3B82F6', hours: 3.33, billableHours: 3.33, billableAmount: 0 },
];

export const TIME_TEAM: TeamMemberRow[] = [
  {
    id: 201,
    name: '[SAMPLE] Hiromi Hourglass',
    initials: 'HH',
    hours: 7.93,
    billableHours: 3.31,
    utilization: 23,
    billableAmount: 323.75,
  },
  {
    id: 202,
    name: '[SAMPLE] Kiran Kronological',
    initials: 'KK',
    hours: 11.4,
    billableHours: 11.4,
    utilization: 33,
    billableAmount: 661.25,
  },
  {
    id: 203,
    name: '[SAMPLE] Tamara Timekeeper',
    initials: 'TT',
    hours: 2.84,
    billableHours: 2.84,
    utilization: 8,
    billableAmount: 497.0,
  },
  {
    id: 204,
    name: '[SAMPLE] Warrin Wristwatch',
    initials: 'WW',
    hours: 7.51,
    billableHours: 4.78,
    utilization: 21,
    billableAmount: 0,
  },
];

export const TIME_TOTALS = {
  totalHours: 80.09,
  billableHours: 50.96,
  nonBillableHours: 29.13,
  billablePercent: 64,
  billableAmount: 5766.0,
  uninvoicedAmount: 5766.0,
};

// ---------- DETAILED TIME ----------

export const DETAILED_TIME_ROWS: DetailedTimeRow[] = [
  {
    id: 301,
    date: '2026-04-23',
    user: '[SAMPLE] Tamara Timekeeper',
    client: '[SAMPLE] Client A',
    project: '[SAMPLE] Time & Materials Project',
    task: 'Design',
    role: 'Sample Role',
    description: 'This is a sample time entry.',
    hours: 1.86,
    billableRate: 175,
    billableAmount: 325.5,
    status: 'Approved',
  },
  {
    id: 302,
    date: '2026-04-24',
    user: '[SAMPLE] Kiran Kronological',
    client: '[SAMPLE] Client A',
    project: '[SAMPLE] Time & Materials Project',
    task: 'Marketing',
    role: 'Sample Role',
    description: 'This is a sample time entry.',
    hours: 1.77,
    billableRate: 150,
    billableAmount: 265.5,
    status: 'Approved',
  },
  {
    id: 303,
    date: '2026-04-24',
    user: '[SAMPLE] Warrin Wristwatch',
    client: '[SAMPLE] Client A',
    project: '[SAMPLE] Time & Materials Project',
    task: 'Marketing',
    role: 'Sample Role',
    description: 'This is a sample time entry.',
    hours: 2.78,
    billableRate: 150,
    billableAmount: 417.0,
    status: 'Pending',
  },
  {
    id: 304,
    date: '2026-04-25',
    user: '[SAMPLE] Kiran Kronological',
    client: '[SAMPLE] Client A',
    project: '[SAMPLE] Fixed Fee Project',
    task: 'Design',
    role: 'Sample Role',
    description: 'This is a sample time entry.',
    hours: 2.9,
    billableRate: 175,
    billableAmount: 507.5,
    status: 'Approved',
  },
  {
    id: 305,
    date: '2026-04-25',
    user: '[SAMPLE] Tamara Timekeeper',
    client: '[SAMPLE] Client A',
    project: '[SAMPLE] Time & Materials Project',
    task: 'Marketing',
    role: 'Sample Role',
    description: 'This is a sample time entry.',
    hours: 2.93,
    billableRate: 150,
    billableAmount: 439.5,
    status: 'Approved',
  },
  {
    id: 306,
    date: '2026-04-25',
    user: '[SAMPLE] Tamara Timekeeper',
    client: '[SAMPLE] Client A',
    project: '[SAMPLE] Fixed Fee Project',
    task: 'Marketing',
    role: 'Sample Role',
    description: 'This is a sample time entry.',
    hours: 2.17,
    billableRate: 150,
    billableAmount: 325.5,
    status: 'Pending',
  },
];

// ---------- PROFITABILITY ----------

export const PROFIT_TOTALS = {
  revenue: 29867.0,
  revenueChange: 154.36,
  cost: 22672.4,
  costChange: 135.77,
  profit: 7194.6,
  profitChange: 238.4,
  marginPercent: 24,
  invoiced: 0,
  uninvoiced: 29867.0,
  timeCost: 22463.4,
  expenseCost: 209.0,
};

export const PROFIT_CLIENTS: ProfitabilityRow[] = [
  {
    id: 1,
    name: '[SAMPLE] Client A',
    revenue: 13776.5,
    cost: 10724.8,
    profit: 3051.7,
    margin: 22,
    returnOnCost: 28,
    hasMissingData: true,
  },
  {
    id: 2,
    name: '[SAMPLE] Client B',
    revenue: 14881.5,
    cost: 11947.6,
    profit: 2933.9,
    margin: 20,
    returnOnCost: 25,
  },
  {
    id: 3,
    name: 'Example Client',
    revenue: 1209.0,
    cost: 0,
    profit: 1209.0,
    margin: 100,
    returnOnCost: 0,
    hasMissingData: true,
  },
];

export const PROFIT_PROJECTS: ProfitabilityRow[] = [
  {
    id: 11,
    name: '[SAMPLE] Monthly Retainer',
    client: '[SAMPLE] Client B',
    type: 'Time & Materials',
    revenue: 14881.5,
    cost: 6244.2,
    profit: 8637.3,
    margin: 58,
    returnOnCost: 138,
  },
  {
    id: 12,
    name: '[SAMPLE] Time & Materials Project',
    client: '[SAMPLE] Client A',
    type: 'Time & Materials',
    revenue: 13776.5,
    cost: 5766.0,
    profit: 8010.5,
    margin: 58,
    returnOnCost: 139,
  },
  {
    id: 13,
    name: 'Example Project',
    client: 'Example Client',
    type: 'Time & Materials',
    revenue: 1209.0,
    cost: 0,
    profit: 1209.0,
    margin: 100,
    returnOnCost: 0,
    hasMissingData: true,
  },
  {
    id: 14,
    name: '[SAMPLE] Fixed Fee Project',
    client: '[SAMPLE] Client A',
    type: 'Fixed Fee',
    revenue: 0,
    cost: 4958.8,
    profit: -4958.8,
    margin: 0,
    returnOnCost: -100,
    hasMissingData: true,
  },
  {
    id: 15,
    name: '[SAMPLE] Non-Billable Project',
    client: '[SAMPLE] Client B',
    type: 'Non-Billable',
    revenue: 0,
    cost: 5703.4,
    profit: -5703.4,
    margin: 0,
    returnOnCost: -100,
  },
];

export const PROFIT_TEAM: ProfitabilityRow[] = [
  {
    id: 201,
    name: '[SAMPLE] Tamara Timekeeper',
    revenue: 10080.0,
    cost: 5146.2,
    profit: 4933.8,
    margin: 49,
    returnOnCost: 96,
  },
  {
    id: 202,
    name: '[SAMPLE] Kiran Kronological',
    revenue: 7325.0,
    cost: 3568.8,
    profit: 3756.2,
    margin: 51,
    returnOnCost: 105,
  },
  {
    id: 203,
    name: '[SAMPLE] Warrin Wristwatch',
    revenue: 8183.0,
    cost: 5535.0,
    profit: 2648.0,
    margin: 32,
    returnOnCost: 48,
  },
  {
    id: 204,
    name: '[SAMPLE] Hiromi Hourglass',
    revenue: 3070.0,
    cost: 3463.6,
    profit: -393.6,
    margin: -13,
    returnOnCost: -11,
  },
];

export const PROFIT_TASKS: ProfitabilityRow[] = [
  { id: 101, name: 'Design', revenue: 11800.75, cost: 5226.0, profit: 6574.75, margin: 56, returnOnCost: 126 },
  { id: 102, name: 'Marketing', revenue: 8879.0, cost: 4667.0, profit: 4212.0, margin: 47, returnOnCost: 90 },
  { id: 103, name: 'Programming', revenue: 7046.0, cost: 3214.8, profit: 3831.2, margin: 54, returnOnCost: 119 },
  {
    id: 104,
    name: 'Project Management',
    revenue: 2141.25,
    cost: 986.8,
    profit: 1154.45,
    margin: 54,
    returnOnCost: 117,
  },
  {
    id: 105,
    name: 'Business Development',
    revenue: 0,
    cost: 3487.0,
    profit: -3487.0,
    margin: 0,
    returnOnCost: -100,
  },
];

// Trend chart data (Apr / May / Jun) — used for Profitability inline SVG chart.
export const PROFIT_TREND = [
  { label: 'Apr 2026', revenue: 13800, cost: 9800, profit: 4000 },
  { label: 'May 2026', revenue: 9300, cost: 7700, profit: 1600 },
  { label: 'Jun 2026', revenue: 6750, cost: 5170, profit: 1580 },
];

// ---------- ACTIVITY LOG ----------

export const ACTIVITY_ROWS: ActivityRow[] = [
  {
    id: 1,
    time: '3:00 pm',
    date: '20/04/2026',
    activity: 'Stopped a timer for a time entry from 20 Apr 2026',
    hours: '0.03',
    client: 'Example Client',
    project: 'Example Project',
    task: 'Design',
    performedBy: 'katyayani sahu',
    type: 'timesheet',
  },
  {
    id: 2,
    time: '2:58 pm',
    date: '20/04/2026',
    activity: 'Started a timer for a time entry from 20 Apr 2026',
    client: 'Example Client',
    project: 'Example Project',
    task: 'Design',
    performedBy: 'katyayani sahu',
    type: 'timesheet',
  },
  {
    id: 3,
    time: '11:57 am',
    date: '20/04/2026',
    activity: 'Stopped a timer for a time entry from 20 Apr 2026',
    hours: '0.58',
    client: 'Example Client',
    project: 'Example Project',
    task: 'Design',
    performedBy: 'Katyayani Sahu',
    type: 'timesheet',
  },
  {
    id: 4,
    time: '11:23 am',
    date: '20/04/2026',
    activity: 'Started a timer for a time entry from 20 Apr 2026',
    client: 'Example Client',
    project: 'Example Project',
    task: 'Design',
    performedBy: 'Katyayani Sahu',
    type: 'timesheet',
  },
  {
    id: 5,
    time: '11:13 am',
    date: '20/04/2026',
    activity: 'Stopped a timer for a time entry from 20 Apr 2026',
    hours: '0.28',
    client: 'Example Client',
    project: 'Example Project',
    task: 'Design',
    performedBy: 'katyayani sahu',
    type: 'timesheet',
  },
  {
    id: 6,
    time: '11:13 am',
    date: '20/04/2026',
    activity: 'Created a time entry for 20 Apr 2026',
    hours: '2.00',
    client: 'Example Client',
    project: 'Example Project',
    task: 'Design',
    performedBy: 'katyayani sahu',
    type: 'timesheet',
  },
  {
    id: 7,
    time: '10:57 am',
    date: '20/04/2026',
    activity: 'Started a timer for a time entry from 20 Apr 2026',
    client: 'Example Client',
    project: 'Example Project',
    task: 'Design',
    performedBy: 'katyayani sahu',
    type: 'timesheet',
  },
  {
    id: 8,
    time: '10:57 am',
    date: '20/04/2026',
    activity: 'Edited a time entry for 20 Apr 2026',
    hours: '11.08 → 0.00',
    client: 'Example Client',
    project: 'Example Project',
    task: 'Design',
    performedBy: 'katyayani sahu',
    type: 'timesheet',
  },
  {
    id: 9,
    time: '10:55 am',
    date: '20/04/2026',
    activity: 'Created a time entry for 20 Apr 2026',
    hours: '11.08',
    client: 'Example Client',
    project: 'Example Project',
    task: 'Design',
    performedBy: 'katyayani sahu',
    type: 'timesheet',
  },
];
