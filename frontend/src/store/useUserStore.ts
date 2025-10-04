import create from 'zustand';

interface UserState {
  user: { id: string; name: string } | null;
  setUser: (user: { id: string; name: string } | null) => void;
}

const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

export default useUserStore;