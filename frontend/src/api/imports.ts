import api from './client';

export interface ImportBatch {
  id: number;
  kind: 'time_entries';
  record_count: number;
  surviving_record_count: number;
  source_filename: string;
  note: string;
  created_by: number | null;
  created_by_name: string;
  created_by_email: string;
  created_at: string;
}

export interface ImportTimeRow {
  date: string;
  project: string;
  task: string;
  person?: string;
  hours: number | string;
  notes?: string;
  billable?: boolean | string;
  /** A label for error reporting back to the user (e.g. "Row 4: Marketing"). */
  row_label?: string;
}

export interface ImportTimeResult {
  created: number;
  errors: { row: string; error: string }[];
  batch?: ImportBatch | null;
  date_range?: { start: string | null; end: string | null };
  detail?: string;
}

export async function importTimeEntries(payload: {
  rows: ImportTimeRow[];
  source_filename?: string;
}): Promise<ImportTimeResult> {
  const { data } = await api.post<ImportTimeResult>('/imports/time/', payload);
  return data;
}

export async function listImports(): Promise<ImportBatch[]> {
  const { data } = await api.get<ImportBatch[]>('/imports/');
  return data;
}

export async function revertImport(id: number): Promise<{ reverted: number }> {
  const { data } = await api.delete<{ reverted: number }>(`/imports/${id}/`);
  return data;
}
