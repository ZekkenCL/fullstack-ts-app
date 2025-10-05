import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SharedMessage } from '../../../shared/src/types';

// UIMessage extiende el mensaje de dominio con campos de estado optimista
export type MessageStatus = 'pending' | 'sent' | 'failed';
export interface UIMessage extends Partial<SharedMessage> {
  tempId?: string;         // id temporal local
  status?: MessageStatus;  // estado optimista
  clientMsgId?: string;    // correlación eco servidor
}

interface MessagesState {
  byChannel: Record<number, UIMessage[]>;
  lastRead: Record<number, number>; // channelId -> last read message id
  unread: Record<number, number>;   // channelId -> count (derived, but we cache for quick list rendering)
  setChannel: (channelId: number, messages: UIMessage[]) => void;
  append: (channelId: number, message: UIMessage) => void;
  updateMessage: (channelId: number, predicate: (m: UIMessage) => boolean, mutator: (m: UIMessage) => UIMessage) => void;
  clearChannel: (channelId: number) => void;
  clearAll: () => void;
  markRead: (channelId: number, upToId?: number) => void;
  recomputeUnread: (channelId: number) => void;
  incrementUnread: (channelId: number) => void;
}

export const useMessagesStore = create<MessagesState>()(persist(
  (set) => ({
    byChannel: {},
    lastRead: {},
    unread: {},
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
    markRead: (channelId, upToId) => set(s => {
      const list = s.byChannel[channelId] || [];
      const latest = upToId ?? [...list].reverse().find(m => m.id)?.id;
      if (!latest) return {} as any;
      const unreadCount = (list.filter(m => m.id && m.id > latest).length) || 0;
      return { lastRead: { ...s.lastRead, [channelId]: latest }, unread: { ...s.unread, [channelId]: unreadCount } };
    }),
    recomputeUnread: (channelId) => set(s => {
      const last = s.lastRead[channelId] || 0;
      const list = s.byChannel[channelId] || [];
      const unreadCount = list.filter(m => m.id && m.id > last).length;
      return { unread: { ...s.unread, [channelId]: unreadCount } };
    }),
    incrementUnread: (channelId) => set(s => ({ unread: { ...s.unread, [channelId]: (s.unread[channelId] || 0) + 1 } }))
  }),
  {
    name: 'messages-store',
    partialize: (s) => ({ byChannel: s.byChannel, lastRead: s.lastRead, unread: s.unread }),
    version: 3,
    migrate: (persisted: any, version) => {
      if (version === 2) {
        return { ...persisted, lastRead: {}, unread: {} };
      }
      return persisted;
    }
  }
));

export function getMessagesStore() { return { getState: useMessagesStore.getState, setState: useMessagesStore.setState }; }