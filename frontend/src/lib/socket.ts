import { io, Socket } from 'socket.io-client';
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

export interface ChannelMessage {
  id?: number;
  tempId?: string;
  content?: string;
  senderId?: number;
  channelId?: number;
  createdAt?: string;
  raw?: any;
  status?: 'pending' | 'sent' | 'failed';
}

export function useChannel(channelId: number | null) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const timersRef = useRef<Record<string, any>>({});
  const FAILURE_TIMEOUT = 5000; // ms
  useEffect(() => {
    if (!channelId) return;
    socketManager.joinChannel(channelId);
    const off = socketManager.on('messageReceived', (msg: any) => {
      if (msg.channelId === channelId) {
        setMessages(prev => {
          const idx = prev.findIndex(m => m.status === 'pending' && !m.id && m.content === msg.content);
          if (idx !== -1) {
            const clone = [...prev];
            clone[idx] = { ...clone[idx], ...msg, raw: msg, id: msg.id, status: 'sent' };
            const tempId = clone[idx].tempId;
            if (tempId && timersRef.current[tempId]) {
              clearTimeout(timersRef.current[tempId]);
              delete timersRef.current[tempId];
            }
            return clone;
          }
            return [...prev, { ...msg, raw: msg, id: msg.id, status: 'sent' }];
        });
      }
    });
    return () => { off(); };
  }, [channelId]);

  const sendMessage = useCallback((content: string) => {
    if (!channelId) return;
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setMessages(prev => [...prev, { tempId, content, channelId, status: 'pending' }]);
    socketManager.emit('sendMessage', { channelId, content });
    timersRef.current[tempId] = setTimeout(() => {
      setMessages(prev => prev.map(m => m.tempId === tempId && !m.id && m.status === 'pending' ? { ...m, status: 'failed' } : m));
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
      clone[idx] = { ...original, tempId: newTemp, status: 'pending' };
      // emit again
      socketManager.emit('sendMessage', { channelId, content: original.content });
      timersRef.current[newTemp] = setTimeout(() => {
        setMessages(p => p.map(m => m.tempId === newTemp && !m.id && m.status === 'pending' ? { ...m, status: 'failed' } : m));
        delete timersRef.current[newTemp];
      }, FAILURE_TIMEOUT);
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