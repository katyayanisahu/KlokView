import axios from 'axios';

import api from './client';
import type {
  ApiEnvelope,
  AssignProjectsPayload,
  InviteAcceptPayload,
  InviteAcceptResponse,
  InviteCreatePayload,
  InviteCreateResponse,
  InviteUpdatePayload,
  InviteValidateResponse,
} from '@/types';

const publicBaseURL =
  import.meta.env.VITE_API_BASE_URL ??
  `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;

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

export async function createInvite(payload: InviteCreatePayload): Promise<InviteCreateResponse> {
  const { data } = await api.post<ApiEnvelope<InviteCreateResponse>>('/auth/invites/', payload);
  return unwrap(data);
}

export async function updateInvite(
  userId: number,
  payload: InviteUpdatePayload,
): Promise<InviteCreateResponse> {
  const { data } = await api.patch<ApiEnvelope<InviteCreateResponse>>(
    `/auth/invites/${userId}/`,
    payload,
  );
  return unwrap(data);
}

export async function assignProjectsToInvite(
  userId: number,
  payload: AssignProjectsPayload,
): Promise<{ assigned_count: number; manager_count: number }> {
  const { data } = await api.post<ApiEnvelope<{ assigned_count: number; manager_count: number }>>(
    `/auth/invites/${userId}/assign-projects/`,
    payload,
  );
  return unwrap(data);
}

export async function validateInvite(token: string): Promise<InviteValidateResponse> {
  const { data } = await axios.get<ApiEnvelope<InviteValidateResponse>>(
    `${publicBaseURL}/auth/invites/validate/`,
    { params: { token } },
  );
  return unwrap(data);
}

export async function acceptInvite(payload: InviteAcceptPayload): Promise<InviteAcceptResponse> {
  const { data } = await axios.post<ApiEnvelope<InviteAcceptResponse>>(
    `${publicBaseURL}/auth/invites/accept/`,
    payload,
  );
  return unwrap(data);
}

export async function resendInvite(userId: number): Promise<{ detail: string; invite_url?: string }> {
  const { data } = await api.post<ApiEnvelope<{ detail: string; invite_url?: string }>>(
    `/auth/invites/${userId}/resend/`,
  );
  return unwrap(data);
}
