import { io, Socket } from 'socket.io-client';
// Using relative path to shared package source to avoid build step for now
import type { SharedMessage } from '../../../shared/src/types';
import { getUIStore } from '../store/uiStore';
import { getAuthStore } from '../store/authStore';
import { forceLogout } from './apiClient';

type Listener = (...args: any[]) => void;

interface PendingEmit { event: string; args: any[] }

class SocketManager {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private buffer: PendingEmit[] = [];
  private reconnecting = false;

  private get url() {
    return process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
  }

  connect() {
    if (this.socket) return this.socket;
    const accessToken = getAuthStore().getState().accessToken;
    this.socket = io(this.url, { auth: { token: accessToken }, autoConnect: true });
    this.wire();
    return this.socket;
  }

  private wire() {
    if (!this.socket) return;
    this.socket.on('connect', () => {
      this.flush();
    });
    this.socket.on('disconnect', () => {
      // noop for now
    });
    this.socket.on('error', (err: any) => {
      if (err?.message === 'Unauthenticated socket') {
        forceLogout();
      } else if (err?.message) {
        try { getUIStore().getState().push({ type: 'error', message: err.message }); } catch {}
      }
    });
    this.socket.on('connect_error', (e: any) => {
      try { getUIStore().getState().push({ type: 'warning', message: 'WS error: ' + (e.message || 'conexión fallida') }); } catch {}
    });
  }

  private flush() {
    if (!this.socket) return;
    for (const p of this.buffer) {
      this.socket.emit(p.event, ...p.args);
    }
    this.buffer = [];
  }

  ensure() {
    if (!this.socket || !this.socket.connected) this.connect();
    return this.socket!;
  }

  emit(event: string, ...args: any[]) {
    const s = this.ensure();
    if (!s.connected) {
      this.buffer.push({ event, args });
      return;
    }
    s.emit(event, ...args);
  }

  on(event: string, handler: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    const s = this.ensure();
    s.on(event, handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Listener) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler);
    }
    if (this.socket) this.socket.off(event, handler);
  }

  reauth() {
    const accessToken = getAuthStore().getState().accessToken;
    if (this.socket) {
      if (this.socket.auth) (this.socket as any).auth.token = accessToken;
      // Force reconnect to send new auth
      this.socket.disconnect().connect();
    }
  }

  joinChannel(channelId: number) {
    this.emit('joinChannel', { channelId });
  }
}

export const socketManager = new SocketManager();

// Simple hook for channel messages (replaces previous useChannel)
import { useEffect, useState, useCallback, useRef } from 'react';
import { useMessagesStore } from '../store/messagesStore';
import type { UIMessage } from '../store/messagesStore';

// Extend UIMessage ensuring optional domain fields for reconciliation
export interface ChannelMessage extends UIMessage { raw?: any; id?: number; content?: string; channelId?: number; senderId?: number; }

export function useChannel(channelId: number | null) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const msgStore = useMessagesStore();
  const timersRef = useRef<Record<string, any>>({});
  const FAILURE_TIMEOUT = 5000; // ms
  // hydrate from cache when channel changes
  useEffect(() => {
    if (channelId) {
      const cached = msgStore.byChannel[channelId];
      if (cached) setMessages(cached as ChannelMessage[]);
    }
  }, [channelId, msgStore.byChannel]);
  useEffect(() => {
    if (!channelId) return;
    socketManager.joinChannel(channelId);
    const off = socketManager.on('messageReceived', (msg: any) => {
      // Active channel: perform optimistic reconciliation
      if (msg.channelId === channelId) {
        setMessages(prev => {
          const idx = prev.findIndex(m => m.status === 'pending' && !m.id && (m.tempId === msg.clientMsgId));
          if (idx !== -1) {
            const clone = [...prev];
            clone[idx] = { ...clone[idx], ...msg, raw: msg, id: msg.id, status: 'sent' } as ChannelMessage;
            const tempId = clone[idx].tempId;
            if (tempId && timersRef.current[tempId]) {
              clearTimeout(timersRef.current[tempId]);
              delete timersRef.current[tempId];
            }
            if (channelId) msgStore.setChannel(channelId, clone as ChannelMessage[]);
            return clone;
          }
          const next = [...prev, { ...msg, raw: msg, id: msg.id, status: 'sent' } as ChannelMessage];
          if (channelId) msgStore.setChannel(channelId, next as ChannelMessage[]);
          return next;
        });
        // mark read automatically for active channel (scroll logic will adjust lastRead id); optional skip here
        return;
      }
      // Inactive channel: store message and recompute unread count
      const existing = msgStore.byChannel[msg.channelId] || [];
      msgStore.setChannel(msg.channelId, [...existing, { ...msg, raw: msg, id: msg.id, status: 'sent' }]);
      msgStore.recomputeUnread(msg.channelId);
    });
    return () => { off(); };
  }, [channelId]);

  const sendMessage = useCallback((content: string) => {
    if (!channelId) return;
  const tempId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setMessages(prev => {
      const next = [...prev, { tempId, content, channelId, status: 'pending' } as ChannelMessage];
      if (channelId) msgStore.setChannel(channelId, next as ChannelMessage[]);
      return next;
    });
  socketManager.emit('sendMessage', { channelId, content, clientMsgId: tempId, clientSentAt: Date.now() });
    timersRef.current[tempId] = setTimeout(() => {
      setMessages(prev => {
        const next = prev.map(m => m.tempId === tempId && !m.id && m.status === 'pending' ? ({ ...m, status: 'failed' } as ChannelMessage) : m) as ChannelMessage[];
        if (channelId) msgStore.setChannel(channelId, next as ChannelMessage[]);
        return next;
      });
      delete timersRef.current[tempId];
    }, FAILURE_TIMEOUT);
  }, [channelId]);

  const resendMessage = useCallback((tempId: string) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.tempId === tempId && m.status === 'failed');
      if (idx === -1) return prev;
      const clone = [...prev];
      const original = clone[idx];
      const newTemp = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      clone[idx] = { ...original, tempId: newTemp, status: 'pending' } as ChannelMessage;
      // emit again
  socketManager.emit('sendMessage', { channelId, content: original.content, clientMsgId: newTemp, clientSentAt: Date.now() });
      timersRef.current[newTemp] = setTimeout(() => {
        setMessages(p => {
          const next = p.map(m => m.tempId === newTemp && !m.id && m.status === 'pending' ? ({ ...m, status: 'failed' } as ChannelMessage) : m) as ChannelMessage[];
          if (channelId) msgStore.setChannel(channelId, next as ChannelMessage[]);
          return next;
        });
        delete timersRef.current[newTemp];
      }, FAILURE_TIMEOUT);
      if (channelId) msgStore.setChannel(channelId, clone as ChannelMessage[]);
      return clone;
    });
  }, [channelId]);

  return { messages, sendMessage, resendMessage };
}

// Presence hook: listens to channelPresence events and filters by channelId
interface PresenceUser { userId: number; username: string }
export function useChannelPresence(channelId: number | null) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  useEffect(() => {
    if (!channelId) { setUsers([]); return; }
    socketManager.joinChannel(channelId);
    const off = socketManager.on('channelPresence', (payload: any) => {
      if (payload.channelId === channelId) {
        // payload.users expected: array of { userId, username }
        setUsers(payload.users || []);
      }
    });
    return () => { off(); setUsers([]); };
  }, [channelId]);
  return users;
}

// Typing hook
export function useTyping(channelId: number | null, debounceMs = 250) {
  const [typingUsers, setTypingUsers] = useState<{ userId: number; username: string }[]>([]);
  const timeoutRef = useRef<Record<number, any>>({});
  useEffect(() => {
    if (!channelId) { setTypingUsers([]); return; }
    const off = socketManager.on('channelTyping', (payload: any) => {
      if (payload.channelId !== channelId) return;
      setTypingUsers(prev => {
        const exists = prev.find(p => p.userId === payload.userId);
        if (payload.typing) {
          if (exists) return prev;
          return [...prev, { userId: payload.userId, username: payload.username }];
        } else {
          return prev.filter(p => p.userId !== payload.userId);
        }
      });
      // auto-remove after debounce to avoid stuck indicators
      if (payload.typing) {
        if (timeoutRef.current[payload.userId]) clearTimeout(timeoutRef.current[payload.userId]);
        timeoutRef.current[payload.userId] = setTimeout(() => {
          setTypingUsers(prev => prev.filter(p => p.userId !== payload.userId));
          delete timeoutRef.current[payload.userId];
        }, debounceMs * 3);
      }
    });
    return () => { off(); Object.values(timeoutRef.current).forEach(t => clearTimeout(t)); setTypingUsers([]); };
  }, [channelId, debounceMs]);

  const emitTyping = useCallback((isTyping: boolean) => {
    if (!channelId) return;
    socketManager.emit('typing', { channelId, typing: isTyping });
  }, [channelId]);

  return { typingUsers, emitTyping };
}