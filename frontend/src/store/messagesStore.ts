import create from 'zustand';
import { persist } from 'zustand/middleware';

// Minimal duplication of ChannelMessage shape (avoid import cycle with socket.ts)
export interface CachedMessage {
  id?: number;
  channelId?: number;
  senderId?: number;
  content?: string;
  createdAt?: string;
  clientMsgId?: string;
  tempId?: string;
  status?: 'pending' | 'sent' | 'failed';
}

interface MessagesState {
  byChannel: Record<number, CachedMessage[]>;
  setChannel: (channelId: number, messages: CachedMessage[]) => void;
  append: (channelId: number, message: CachedMessage) => void;
  updateMessage: (channelId: number, predicate: (m: CachedMessage) => boolean, mutator: (m: CachedMessage) => CachedMessage) => void;
  clearChannel: (channelId: number) => void;
  clearAll: () => void;
}

export const useMessagesStore = create<MessagesState>()(persist(
  (set) => ({
    byChannel: {},
    setChannel: (channelId, messages) => set(s => ({ byChannel: { ...s.byChannel, [channelId]: messages } })),
    append: (channelId, message) => set(s => ({ byChannel: { ...s.byChannel, [channelId]: [...(s.byChannel[channelId]||[]), message] } })),
    updateMessage: (channelId, predicate, mutator) => set(s => ({
      byChannel: {
        ...s.byChannel,
        [channelId]: (s.byChannel[channelId]||[]).map(m => predicate(m) ? mutator(m) : m)
      }
    })),
    clearChannel: (channelId) => set(s => { const copy = { ...s.byChannel }; delete copy[channelId]; return { byChannel: copy }; }),
    clearAll: () => set({ byChannel: {} }),
  }),
  {
    name: 'messages-store',
    partialize: (s) => ({ byChannel: s.byChannel }),
    version: 1,
  }
));

export function getMessagesStore() { return { getState: useMessagesStore.getState, setState: useMessagesStore.setState }; }