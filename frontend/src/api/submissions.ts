import api from './client';
import type {
  Paginated,
  Submission,
  SubmissionCreatePayload,
  SubmissionDecisionPayload,
  SubmissionListParams,
} from '@/types';

export async function listSubmissions(
  params?: SubmissionListParams,
): Promise<Submission[]> {
  const { data } = await api.get<Paginated<Submission> | Submission[]>(
    '/submissions/',
    { params },
  );
  return Array.isArray(data) ? data : data.results;
}

export async function createSubmission(
  payload: SubmissionCreatePayload,
): Promise<Submission> {
  const { data } = await api.post<Submission>('/submissions/', payload);
  return data;
}

export async function withdrawSubmission(id: number): Promise<{ detail: string }> {
  const { data } = await api.post<{ detail: string }>(`/submissions/${id}/withdraw/`);
  return data;
}

export async function unapproveSubmission(id: number): Promise<Submission> {
  const { data } = await api.post<Submission>(`/submissions/${id}/unapprove/`);
  return data;
}

export async function approveSubmission(
  id: number,
  payload?: SubmissionDecisionPayload,
): Promise<Submission> {
  const { data } = await api.post<Submission>(
    `/submissions/${id}/approve/`,
    payload ?? {},
  );
  return data;
}

export async function rejectSubmission(
  id: number,
  payload: SubmissionDecisionPayload,
): Promise<Submission> {
  const { data } = await api.post<Submission>(`/submissions/${id}/reject/`, payload);
  return data;
}
