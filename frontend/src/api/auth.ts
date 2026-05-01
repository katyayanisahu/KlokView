import api from './client';
import type { ApiEnvelope, LoginResponse, RegisterResponse, User } from '@/types';

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

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<ApiEnvelope<LoginResponse>>('/auth/login/', { email, password });
  return unwrap(data);
}

export async function registerRequest(params: {
  email: string;
  full_name: string;
  password: string;
  company_name?: string;
}): Promise<RegisterResponse> {
  const { data } = await api.post<ApiEnvelope<RegisterResponse>>('/auth/register/', params);
  return unwrap(data);
}

export async function meRequest(): Promise<User> {
  const { data } = await api.get<ApiEnvelope<User>>('/auth/me/');
  return unwrap(data);
}

export interface PasswordResetRequestResult {
  detail: string;
  reset_url?: string;
}

export async function passwordResetRequest(email: string): Promise<PasswordResetRequestResult> {
  const { data } = await api.post<ApiEnvelope<PasswordResetRequestResult>>('/auth/password-reset/', {
    email,
  });
  return unwrap(data);
}

export async function passwordResetConfirm(params: {
  uid: string;
  token: string;
  new_password: string;
}): Promise<void> {
  const { data } = await api.post<ApiEnvelope<{ detail: string }>>(
    '/auth/password-reset/confirm/',
    params,
  );
  unwrap(data);
}
