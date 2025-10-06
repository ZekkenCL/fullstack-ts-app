// Simple fetch wrapper with automatic JSON, auth header and refresh flow placeholder.
import { getAuthStore } from '../store/authStore';
import { getUIStore } from '../store/uiStore';

// Custom API error with HTTP status and optional payload
export class ApiError extends Error {
  status: number;
  body: any;
  code?: string;
  constructor(status: number, message: string, body?: any, code?: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(currentRefresh: string, store: ReturnType<typeof getAuthStore>): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: currentRefresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    store.getState().setTokens(data.accessToken, data.refreshToken);
    if (data.user && typeof data.user.id === 'number') {
      store.getState().setUser?.({ id: data.user.id, username: data.user.username });
    }
    return true;
  } catch {
    return false;
  }
}

async function refreshToken(): Promise<boolean> {
  const store = getAuthStore();
  const rt = store.getState().refreshToken;
  if (!rt) return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const ok = await performRefresh(rt, store);
    refreshInFlight = null;
    return ok;
  })();
  return refreshInFlight;
}

// Central logout with redirect (client-side only)
export function forceLogout() {
  const store = getAuthStore();
  store.getState().clear();
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem('auth-store'); } catch {}
    if (window.location.pathname !== '/login') window.location.assign('/login');
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: any = null; let message = 'Request failed'; let code: string | undefined;
  const ct = res.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      body = await res.json();
      message = body.message || body.error || message;
      code = body.code;
    } else {
      const text = await res.text();
      body = text;
      message = text || message;
    }
  } catch {
    // swallow parse errors
  }
  return new ApiError(res.status, message, body, code);
}

export async function apiRequest<T = any>(path: string, options: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const store = getAuthStore();
  const { accessToken } = store.getState();
  const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(options.headers as any) };
  if (options.auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const attempt = async (h: Record<string,string>): Promise<Response> => {
    return fetch(BASE_URL + path, { ...options, headers: h });
  };

  let res = await attempt(headers);

  if (res.status === 401 && options.auth) {
    const refreshed = await refreshToken();
    if (refreshed) {
      const newAccess = store.getState().accessToken;
      const retryHeaders = { ...headers, Authorization: `Bearer ${newAccess}` };
      res = await attempt(retryHeaders);
    } else {
      forceLogout();
      throw new ApiError(401, 'Sesión expirada');
    }
  }

  if (!res.ok) {
    const err = await parseError(res);
    if (err.status !== 401) {
      try { getUIStore().getState().push({ type: 'error', message: err.message }); } catch {}
    }
    throw err;
  }
  if (res.status === 204) return undefined as any;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  // Fallback to text for non-json
  return (await res.text()) as any;
}

export const api = {
  register: (username: string, password: string) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  profile: () => apiRequest('/auth/profile', { method: 'POST', auth: true }),
  listChannels: () => apiRequest('/channels', { method: 'GET', auth: true }),
  aggregatedUnreads: () => apiRequest('/channels/unreads/aggregate', { method: 'GET', auth: true }),
  markChannelRead: (id: number, messageId?: number) => apiRequest(`/channels/${id}/read`, { method: 'POST', auth: true, body: JSON.stringify(messageId ? { messageId } : {}) }),
  createChannel: (name: string) => apiRequest('/channels', { method: 'POST', auth: true, body: JSON.stringify({ name }) }),
  deleteChannel: (id: number) => apiRequest(`/channels/${id}`, { method: 'DELETE', auth: true }),
  updateChannel: (id: number, name: string) => apiRequest(`/channels/${id}`, { method: 'PATCH', auth: true, body: JSON.stringify({ name }) }),
  leaveChannel: (id: number) => apiRequest(`/channels/${id}/leave`, { method: 'POST', auth: true }),
  channelMembers: (id: number, q?: string) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    return apiRequest(`/channels/${id}/members${qs.toString() ? `?${qs.toString()}`:''}`, { method: 'GET', auth: true });
  },
  joinChannel: (id: number) => apiRequest(`/channels/${id}/join`, { method: 'POST', auth: true }),
  channelMessages: (id: number, params: { cursor?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', String(params.cursor));
    const q = qs.toString();
    return apiRequest(`/channels/${id}/messages${q ? `?${q}`:''}`, { method: 'GET', auth: true });
  },
  searchChannel: (id: number, q: string, params: { cursor?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    qs.set('q', q);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', String(params.cursor));
    return apiRequest(`/channels/${id}/search?${qs.toString()}`, { method: 'GET', auth: true });
  },
  globalSearch: (q: string, params: { cursor?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    qs.set('q', q);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', String(params.cursor));
    return apiRequest(`/search/messages?${qs.toString()}`, { method: 'GET', auth: true });
  },
};
