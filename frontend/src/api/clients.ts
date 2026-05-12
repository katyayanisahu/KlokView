import api from './client';
import type { Client, ClientContact, ClientContactPayload, ClientCreatePayload, Paginated } from '@/types';

export async function listClients(
  params?: { is_active?: boolean; search?: string; page_size?: number },
): Promise<Paginated<Client>> {
  const { data } = await api.get<Paginated<Client>>('/clients/', { params });
  return data;
}

export async function createClient(payload: ClientCreatePayload): Promise<Client> {
  const { data } = await api.post<Client>('/clients/', payload);
  return data;
}

export async function getClient(id: number): Promise<Client> {
  const { data } = await api.get<Client>(`/clients/${id}/`);
  return data;
}

export async function updateClient(id: number, payload: Partial<ClientCreatePayload>): Promise<Client> {
  const { data } = await api.patch<Client>(`/clients/${id}/`, payload);
  return data;
}

export async function archiveClient(id: number): Promise<{ detail: string }> {
  const { data } = await api.delete<{ detail: string }>(`/clients/${id}/`);
  return data;
}

export async function restoreClient(id: number): Promise<Client> {
  const { data } = await api.patch<Client>(`/clients/${id}/`, { is_active: true });
  return data;
}

// ---- Contacts ----

export async function listContacts(clientId?: number): Promise<Paginated<ClientContact>> {
  const { data } = await api.get<Paginated<ClientContact>>('/clients/contacts/', {
    params: clientId ? { client: clientId } : undefined,
  });
  return data;
}

export async function createContact(payload: ClientContactPayload): Promise<ClientContact> {
  const { data } = await api.post<ClientContact>('/clients/contacts/', payload);
  return data;
}

export async function updateContact(
  id: number,
  payload: Partial<ClientContactPayload>,
): Promise<ClientContact> {
  const { data } = await api.patch<ClientContact>(`/clients/contacts/${id}/`, payload);
  return data;
}

export async function deleteContact(id: number): Promise<void> {
  await api.delete(`/clients/contacts/${id}/`);
}
