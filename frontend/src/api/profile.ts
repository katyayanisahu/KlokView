import api from './client';
import type {
  ApiEnvelope,
  AssignedPerson,
  MyProfile,
  MyProfileProjectMembership,
  MyProfileUpdatePayload,
  NotificationPrefs,
} from '@/types';

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

export async function getMyProfile(): Promise<MyProfile> {
  const { data } = await api.get<ApiEnvelope<MyProfile>>('/auth/me/profile/');
  return unwrap(data);
}

export async function updateMyProfile(payload: MyProfileUpdatePayload): Promise<MyProfile> {
  const { data } = await api.patch<ApiEnvelope<MyProfile>>('/auth/me/profile/', payload);
  return unwrap(data);
}

export async function getMyNotifications(): Promise<NotificationPrefs> {
  const { data } = await api.get<ApiEnvelope<NotificationPrefs>>('/auth/me/notifications/');
  return unwrap(data);
}

export async function updateMyNotifications(
  payload: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  const { data } = await api.patch<ApiEnvelope<NotificationPrefs>>(
    '/auth/me/notifications/',
    payload,
  );
  return unwrap(data);
}

export async function getMyAssignedPeople(): Promise<AssignedPerson[]> {
  const { data } = await api.get<ApiEnvelope<AssignedPerson[]>>('/auth/me/assigned-people/');
  return unwrap(data);
}

export async function getMyAssignedProjects(): Promise<MyProfileProjectMembership[]> {
  const { data } = await api.get<ApiEnvelope<MyProfileProjectMembership[]>>(
    '/auth/me/assigned-projects/',
  );
  return unwrap(data);
}
