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
import { useEffect, useState, useCallback } from 'react';

export interface ChannelMessage {
  id?: number; content?: string; senderId?: number; channelId?: number; createdAt?: string; raw?: any;
}

export function useChannel(channelId: number | null) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  useEffect(() => {
    if (!channelId) return;
    socketManager.joinChannel(channelId);
    const off = socketManager.on('messageReceived', (msg: any) => {
      if (msg.channelId === channelId) {
        setMessages(prev => [...prev, { ...msg, raw: msg }]);
      }
    });
    return () => { off(); };
  }, [channelId]);

  const sendMessage = useCallback((content: string) => {
    if (!channelId) return;
    socketManager.emit('sendMessage', { channelId, content });
  }, [channelId]);

  return { messages, sendMessage };
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