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
          api.markChannelRead(activeChannelId, lastId).then(() => {
            setChannels(prev => prev.map(c => c.id === activeChannelId ? { ...c, unread: 0 } : c));
          }).catch(()=>{});
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
      api.markChannelRead(id, lastId).then(() => {
        setChannels(prev => prev.map(c => c.id === id ? { ...c, unread: 0 } : c));
      }).catch(()=>{});
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
    <div className="h-screen w-screen flex bg-discord-bg-dark text-discord-text overflow-hidden">
      {/* Server (placeholder) sidebar */}
      <aside className="w-[70px] bg-discord-bg-alt flex flex-col items-center py-3 gap-3 border-r border-discord-border">
        <div className="w-12 h-12 rounded-3xl bg-discord-primary flex items-center justify-center text-white font-bold text-lg hover:rounded-2xl transition-all cursor-pointer">S</div>
        <button title="Nuevo servidor" className="w-12 h-12 rounded-3xl bg-discord-bg-dark hover:bg-discord-primary/60 text-discord-text-muted text-2xl leading-none flex items-center justify-center transition-all">+</button>
      </aside>
      {/* Channel list */}
      <div className="flex flex-col w-60 bg-discord-bg-alt border-r border-discord-border">
        <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-discord-text-muted flex items-center justify-between">
          Canales
          <button onClick={createChannel} className="text-discord-text-muted hover:text-discord-text text-base" title="Crear canal">+</button>
        </div>
        <div className="px-3 mb-2">
          <input value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setNewName(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ createChannel(); } }} placeholder="nuevo-canal" className="w-full bg-discord-input text-sm rounded px-2 py-1 placeholder:text-discord-text-muted focus:outline-none focus:ring-2 focus:ring-discord-primary/40" />
        </div>
        <nav className="flex-1 overflow-y-auto pr-1 space-y-0.5">
          {channels.map(c => {
            const channelMessages = msgStore.byChannel[c.id] || [];
            const lastRead = msgStore.lastRead[c.id] || 0;
            const localUnread = channelMessages.filter(m => m.id && m.id > lastRead).length;
            const unread = c.unread !== undefined ? c.unread : localUnread;
            const active = activeChannelId === c.id;
            return (
              <button key={c.id} onClick={() => { api.joinChannel(c.id); selectChannel(c.id); }}
                className={`group w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm transition-colors hover:bg-discord-bg-hover ${active ? 'bg-discord-bg-hover text-discord-text' : 'text-discord-text-muted'} ${unread>0 && !active ? 'font-medium text-discord-text' : ''}`}> 
                <span className="text-discord-text-muted group-hover:text-discord-text">#</span>
                <span className="flex-1 truncate">{c.name}</span>
                {unread>0 && !active && (
                  <span data-testid={`unread-${c.name}`} className="ml-auto bg-discord-channel-unread-pill text-[10px] leading-none px-2 py-0.5 rounded-full font-semibold text-white">{unread}</span>
                )}
              </button>
            );
          })}
          {!loading && channels.length === 0 && <p className="px-4 py-2 text-xs text-discord-text-muted">No hay canales.</p>}
        </nav>
        <div className="p-3 border-t border-discord-border flex items-center gap-2 text-xs">
          <div className="flex-1 overflow-hidden">
            <p className="font-semibold truncate text-discord-text">{user?.username}</p>
          </div>
          <button onClick={logout} className="text-discord-text-muted hover:text-discord-danger text-[10px] uppercase tracking-wide">Salir</button>
        </div>
      </div>
      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-discord-background">
        <header className="h-12 flex items-center px-4 border-b border-discord-border shadow-inner-sm">
          {activeChannelId ? (
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-discord-text-muted">#</span>
              <span>Canal {activeChannelId}</span>
              <span className="ml-4 text-[11px] font-normal text-discord-text-muted">{presence.length} conectados</span>
            </div>
          ) : <span className="text-sm text-discord-text-muted">Selecciona un canal</span>}
        </header>
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 flex flex-col">
            <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-1 text-sm">
              {activeChannelId && presence.length > 0 && (
                <div className="mb-2 pb-2 border-b border-discord-border">
                  <p className="text-[10px] uppercase tracking-wide text-discord-text-muted mb-1">Presencia</p>
                  <div className="flex flex-wrap gap-2">
                    {presence.map(u => (
                      <span key={u.userId} className="text-[11px] bg-discord-bg-hover text-discord-text px-2 py-0.5 rounded">{u.username}</span>
                    ))}
                  </div>
                </div>
              )}
              {loadingHistory && <p className="text-[10px] text-discord-text-muted">Cargando historial...</p>}
              {activeChannelId && messages.length === 0 && !loadingHistory && <p className="text-xs text-discord-text-muted">Sin mensajes aún.</p>}
              {messages.map((m, idx) => {
                const statusClass = m.status === 'pending' ? 'opacity-50' : m.status === 'failed' ? 'text-discord-danger' : '';
                return (
                  <div key={m.id || m.tempId || idx} className={`group flex gap-2 items-start pr-6 ${statusClass} hover:bg-discord-bg-hover/40 rounded px-2 py-1`}> 
                    <div className="flex-1 leading-snug">
                      <span className="font-semibold text-discord-text mr-2">{m.senderId || 'yo'}</span>
                      <span className="text-discord-text" >{m.content}</span>
                      {m.status === 'pending' && <span className="ml-2 text-[10px] text-discord-text-muted">enviando…</span>}
                      {m.status === 'failed' && (
                        <span className="ml-2 text-[10px] flex items-center gap-2 text-discord-danger">
                          falló
                          {m.tempId && (
                            <button onClick={() => resendMessage(m.tempId!)} className="underline hover:text-white">reintentar</button>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {!autoScroll && newSince > 0 && (
                <button onClick={scrollToBottom} className="sticky bottom-2 ml-auto bg-discord-primary hover:bg-discord-primary/90 text-white text-xs px-3 py-1 rounded shadow">
                  {newSince} nuevo{newSince>1?'s':''} ↓
                </button>
              )}
              {typingUsers.length > 0 && (
                <div className="mt-2 text-[11px] text-discord-text-muted flex items-center gap-2">
                  {typingUsers.slice(0,3).map(u => u.username).join(', ')} {typingUsers.length>3 ? `+${typingUsers.length-3}`: ''} está{typingUsers.length>1?'n':''} escribiendo…
                  <span className="inline-block animate-pulse">•••</span>
                </div>
              )}
            </div>
            {activeChannelId && (
              <div className="p-3 border-t border-discord-border bg-discord-bg-alt flex gap-2">
                <input value={draft} onChange={(e)=>{ setDraft(e.target.value); emitTyping(true); }} onBlur={()=>emitTyping(false)} onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); emitTyping(false); send(); } }} className="flex-1 bg-discord-input border border-discord-border rounded px-3 py-2 text-sm placeholder:text-discord-text-muted focus:outline-none focus:ring-2 focus:ring-discord-primary/40" placeholder="Enviar mensaje" />
                <button onClick={send} className="bg-discord-primary hover:bg-discord-primary/90 text-white px-4 py-2 rounded text-sm font-medium">Enviar</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
