import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/apiClient';

// Minimal hook wrapper around authStore + api profile fetch
export function useAuth() {
  const { user, setUser, clear, accessToken } = useAuthStore();

  const fetchProfile = useCallback(async () => {
    if (!accessToken || user) return user;
    try {
      const data = await api.profile();
      setUser({ username: data.username || data.user?.username || data.name || '' });
      return data;
    } catch (_err) {
      // ignore for now
      return null;
    }
  }, [accessToken, user, setUser]);

  const logout = useCallback(() => {
    clear();
  }, [clear]);

  return { user, accessToken, fetchProfile, logout };
}

export default useAuth;