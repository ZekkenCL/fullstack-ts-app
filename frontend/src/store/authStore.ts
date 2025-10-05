import create from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: { username: string } | null;
  setTokens: (access: string, refresh: string) => void;
  clear: () => void;
  setUser: (u: { username: string } | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
  clear: () => set({ accessToken: null, refreshToken: null, user: null }),
  setUser: (user) => set({ user }),
}));

// Helper para import dinámico sin hook en entornos no React
export function getAuthStore() { return { getState: useAuthStore.getState, setState: useAuthStore.setState }; }
