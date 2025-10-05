import { create } from 'zustand';
import { nanoid } from 'nanoid';

export interface UINotification {
  id: string;
  type: 'error' | 'info' | 'success' | 'warning';
  message: string;
  createdAt: number;
  ttl?: number; // ms
}

interface UIState {
  notifications: UINotification[];
  push: (n: Omit<UINotification, 'id' | 'createdAt'>) => string;
  remove: (id: string) => void;
  clear: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  notifications: [],
  push: (n) => {
    const id = nanoid();
    const note: UINotification = { id, createdAt: Date.now(), ttl: 5000, ...n };
    set((s) => ({ notifications: [...s.notifications, note] }));
    return id;
  },
  remove: (id) => set((s) => ({ notifications: s.notifications.filter(n => n.id !== id) })),
  clear: () => set({ notifications: [] }),
}));

export function getUIStore() {
  return { getState: useUIStore.getState, setState: useUIStore.setState };
}