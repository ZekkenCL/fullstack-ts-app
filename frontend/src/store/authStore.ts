import create from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: { username: string } | null;
  setTokens: (access: string, refresh: string) => void;
  clear: () => void;
  setUser: (u: { username: string } | null) => void;
}

export const useAuthStore = create<AuthState>()(persist(
  (set) => ({
    accessToken: null,
    refreshToken: null,
    user: null,
    setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
    clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    setUser: (user) => set({ user }),
  }),
  {
    name: 'auth-store',
    partialize: (state) => ({ accessToken: state.accessToken, refreshToken: state.refreshToken, user: state.user }),
  }
));

// Helper para import dinámico sin hook en entornos no React
export function getAuthStore() { return { getState: useAuthStore.getState, setState: useAuthStore.setState }; }

// Utility to check hydration completion (Next.js SSR safety)
export function useAuthHydrated() {
  const [hydrated, setHydrated] = require('react').useState(false);
  require('react').useEffect(() => { setHydrated(true); }, []);
  return hydrated;
}
