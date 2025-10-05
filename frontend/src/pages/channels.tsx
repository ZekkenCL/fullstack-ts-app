import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/apiClient';
import { useChannel, useChannelPresence, useTyping } from '../lib/socket';
import { useMessagesStore } from '../store/messagesStore';

import type { SharedChannel } from '../../../shared/src/types';
interface Channel extends SharedChannel { unread?: number }

export default function ChannelsPage() {
  const { accessToken, user, clear } = useAuthStore();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const { messages, sendMessage, resendMessage } = useChannel(activeChannelId);
  const msgStore = useMessagesStore();
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const presence = useChannelPresence(activeChannelId);
  const { typingUsers, emitTyping } = useTyping(activeChannelId);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newSince, setNewSince] = useState(0);

  const onScroll = async () => {
    if (!listRef.current) return;
    const el = listRef.current;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    setAutoScroll(atBottom);
    if (atBottom) setNewSince(0);
    // Load older history when near top
    if (activeChannelId && el.scrollTop < 80 && !loadingHistory && historyCursor) {
      setLoadingHistory(true);
      try {
        const res = await api.channelMessages(activeChannelId, { cursor: historyCursor, limit: 30 });
        // res: { items: [...older ascending...], nextCursor }
        if (res.items && res.items.length) {
          // Preserve scroll position after prepending
          const prevHeight = el.scrollHeight;
          const existing = msgStore.byChannel[activeChannelId] || [];
          const merged = [...res.items, ...existing];
          msgStore.setChannel(activeChannelId, merged);
          setHistoryCursor(res.nextCursor);
          requestAnimationFrame(() => {
            const newHeight = el.scrollHeight;
            el.scrollTop = newHeight - prevHeight; // keep viewport anchored
          });
        } else {
          setHistoryCursor(null); // no more
        }
      } catch (e:any) {
        // optional: set error toast already handled globally
        setHistoryCursor(null);
      } finally {
        setLoadingHistory(false);
      }
    }
  };

  useEffect(() => {
    if (!listRef.current) return;
    if (autoScroll) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      // marcar leídos los que se ven si estamos en canal activo
      if (activeChannelId) {
        const lastId = [...messages].reverse().find(m => m.id)?.id;
        if (lastId) {
          msgStore.markRead(activeChannelId, lastId);
          api.markChannelRead(activeChannelId, lastId).catch(()=>{});
        }
      }
    } else {
      setNewSince(prev => prev + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const scrollToBottom = () => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
    setAutoScroll(true);
    setNewSince(0);
  };

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    let mounted = true;
    api.listChannels()
      .then(data => { if (mounted) { setChannels(data); setLoading(false); } })
      .catch(e => { if (mounted) { setError(e.message); setLoading(false); } });
    return () => { mounted = false; };
  }, [accessToken, router]);

  const createChannel = async () => {
    if (!newName.trim()) return;
    try {
      const ch = await api.createChannel(newName.trim());
  setChannels((prev: Channel[]) => [...prev, ch]);
      setNewName('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const selectChannel = async (id: number) => {
    setActiveChannelId(id);
    // Load initial batch if not already cached
    if (!msgStore.byChannel[id] || msgStore.byChannel[id].length === 0) {
      try {
        const res = await api.channelMessages(id, { limit: 50 });
        if (res.items) msgStore.setChannel(id, res.items);
        setHistoryCursor(res.nextCursor);
        // scroll to bottom after first paint
        requestAnimationFrame(() => scrollToBottom());
      } catch (e:any) {
        // ignore - error toast already handled
      }
    } else {
      // Determine next cursor from oldest cached message
      const oldest = msgStore.byChannel[id][0];
      if (oldest?.id) setHistoryCursor(oldest.id);
    }
    // marcar leídos mensajes existentes
    const lastId = [...(msgStore.byChannel[id]||[])].reverse().find(m => m.id)?.id;
    if (lastId) {
      msgStore.markRead(id, lastId);
      api.markChannelRead(id, lastId).catch(()=>{});
    }
  };

  const send = useCallback(() => {
    if (!draft.trim()) return;
    sendMessage(draft.trim());
    setDraft('');
  }, [draft, sendMessage]);

  const logout = () => { clear(); router.push('/login'); };

  if (!accessToken) return null;
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow">
        <h1 className="text-lg font-semibold">Canales</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.username}</span>
          <button onClick={logout} className="text-sm text-red-600">Salir</button>
        </div>
      </header>
      <main className="flex-1 p-6 space-y-6">
        <div className="flex gap-2">
          <input value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setNewName(e.target.value)} placeholder="Nuevo canal" className="border px-3 py-2 rounded flex-1" />
          <button onClick={createChannel} className="bg-blue-600 text-white px-4 py-2 rounded">Crear</button>
        </div>
        {loading && <p>Cargando...</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-600">Lista</h2>
            <ul className="space-y-2">
              {channels.map(c => {
                const channelMessages = msgStore.byChannel[c.id] || [];
                const lastRead = msgStore.lastRead[c.id] || 0;
                const localUnread = channelMessages.filter(m => m.id && m.id > lastRead).length;
                const unread = c.unread !== undefined ? c.unread : localUnread;
                return (
                  <li key={c.id} className={`border bg-white rounded p-3 flex justify-between items-center ${activeChannelId===c.id ? 'ring-2 ring-blue-500' : ''}`}>
                    <button className="flex-1 text-left" onClick={() => { api.joinChannel(c.id); selectChannel(c.id); }}>{c.name}</button>
                    {unread > 0 && <span data-testid={`unread-${c.name}`} className="ml-2 inline-flex items-center justify-center text-[10px] font-semibold bg-red-500 text-white rounded-full px-2 py-0.5">{unread}</span>}
                  </li>
                );
              })}
              {!loading && channels.length === 0 && <li className="text-sm text-gray-500">No hay canales.</li>}
            </ul>
          </div>
          <div className="md:col-span-2 flex flex-col min-h-[400px] bg-white border rounded">
            {activeChannelId ? (
              <>
                <div className="border-b px-4 py-2 text-sm font-medium flex items-center justify-between">
                  <span>Canal #{activeChannelId}</span>
                  <span className="text-xs text-gray-500">{presence.length} conectados</span>
                </div>
                <div className="flex-1 overflow-auto px-4 py-3 space-y-2 relative" ref={listRef} onScroll={onScroll}>
                  {presence.length > 0 && (
                    <div className="mb-2 pb-2 border-b">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Presencia</p>
                      <div className="flex flex-wrap gap-2">
                        {presence.map(u => (
                          <span key={u.userId} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{u.username}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {loadingHistory && <p className="text-[10px] text-gray-400">Cargando historial...</p>}
                  {messages.length === 0 && !loadingHistory && <p className="text-xs text-gray-500">Sin mensajes aún.</p>}
                  {messages.map((m, idx) => {
                    const statusClass = m.status === 'pending' ? 'opacity-60 italic' : m.status === 'failed' ? 'text-red-600' : '';
                    return (
                      <div key={m.id || m.tempId || idx} className={`text-sm ${statusClass}`}>
                        <span className="text-gray-600">{m.senderId || 'yo'}</span>: {m.content}
                        {m.status === 'pending' && <span className="ml-2 text-xs text-gray-400">(enviando)</span>}
                        {m.status === 'failed' && (
                          <span className="ml-2 text-xs flex items-center gap-2">
                            (falló)
                            {m.tempId && (
                              <button onClick={() => resendMessage(m.tempId!)} className="text-blue-600 underline">reintentar</button>
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {!autoScroll && newSince > 0 && (
                    <button onClick={scrollToBottom} className="absolute bottom-2 right-2 bg-blue-600 text-white text-xs px-3 py-1 rounded shadow">
                      {newSince} nuevo{newSince>1?'s':''} ↓
                    </button>
                  )}
                  {typingUsers.length > 0 && (
                    <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-2">
                      {typingUsers.slice(0,3).map(u => u.username).join(', ')} {typingUsers.length>3 ? `+${typingUsers.length-3}`: ''} está{typingUsers.length>1?'n':''} escribiendo...
                      <span className="inline-block animate-pulse">•••</span>
                    </div>
                  )}
                </div>
                <div className="border-t p-2 flex gap-2">
                  <input value={draft} onChange={(e)=>{ setDraft(e.target.value); emitTyping(true); }} onBlur={()=>emitTyping(false)} onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); emitTyping(false); send(); } }} className="flex-1 border px-3 py-2 rounded" placeholder="Escribe un mensaje" />
                  <button onClick={send} className="bg-blue-600 text-white px-4 py-2 rounded">Enviar</button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Selecciona un canal.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
