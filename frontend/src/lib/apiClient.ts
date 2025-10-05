// Simple fetch wrapper with automatic JSON, auth header and refresh flow placeholder.
import { getAuthStore } from '../store/authStore';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function refreshToken(): Promise<boolean> {
  const store = getAuthStore();
  const refreshToken = store.getState().refreshToken;
  if (!refreshToken) return false;
  try {
    const res = await fetch(BASE_URL + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    store.getState().setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiRequest<T = any>(path: string, options: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const store = getAuthStore();
  const { accessToken } = store.getState();
  const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(options.headers as any) };
  if (options.auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(BASE_URL + path, { ...options, headers });
  if (res.status === 401 && options.auth) {
    const refreshed = await refreshToken();
    if (refreshed) {
      const newAccess = store.getState().accessToken;
      const retryHeaders = { ...headers, Authorization: `Bearer ${newAccess}` };
      const retry = await fetch(BASE_URL + path, { ...options, headers: retryHeaders });
      if (!retry.ok) throw new Error(await retry.text());
      return retry.json();
    }
  }
  if (!res.ok) {
    throw new Error(await res.text());
  }
  if (res.status === 204) return undefined as any;
  return res.json();
}

export const api = {
  register: (username: string, password: string) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  profile: () => apiRequest('/auth/profile', { method: 'POST', auth: true }),
  listChannels: () => apiRequest('/channels', { method: 'GET', auth: true }),
  createChannel: (name: string) => apiRequest('/channels', { method: 'POST', auth: true, body: JSON.stringify({ name }) }),
  joinChannel: (id: number) => apiRequest(`/channels/${id}/join`, { method: 'POST', auth: true }),
};
