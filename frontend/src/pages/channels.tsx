import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  const { messages, sendMessage, resendMessage, addReaction, removeReaction } = useChannel(activeChannelId);
  const msgStore = useMessagesStore();
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const presence = useChannelPresence(activeChannelId);
  const currentUserId = useMemo(() => {
    if (!user?.username) return undefined;
    const me = presence.find(p => p.username === user.username);
    return me?.userId;
  }, [presence, user?.username]);
  const { typingUsers, emitTyping } = useTyping(activeChannelId);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newSince, setNewSince] = useState(0);
  
  const formatTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDay = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Prepara estructura agrupada por día para renderizar separadores tipo Discord
  // Pre-calculate lastRead id for active channel for "Nuevos" separator
  const lastReadId = activeChannelId ? (msgStore.lastRead[activeChannelId] || 0) : 0;

  const groupedMessages = useMemo(() => {
    const groups: { day: string; items: any[] }[] = [];
    let currentDay = '';
    let bucket: any[] = [];
    for (const m of messages) {
      const day = formatDay(m.createdAt as any);
      if (day !== currentDay) {
        if (bucket.length) groups.push({ day: currentDay, items: bucket });
        currentDay = day;
        bucket = [m];
      } else {
        bucket.push(m);
      }
    }
    if (bucket.length) groups.push({ day: currentDay, items: bucket });
    return groups;
  }, [messages]);

  const toggleReaction = async (messageId: number, emoji: string) => {
    try {
      await fetch(`/messages/${messageId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ emoji }) });
    } catch {}
  };

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
              {groupedMessages.map(group => (
                <div key={group.day || Math.random()}>
                  {group.day && (
                    <div className="flex items-center my-4">
                      <div className="flex-1 h-px bg-discord-border" />
                      <span className="mx-4 text-[11px] uppercase tracking-wide text-discord-text-muted">{group.day}</span>
                      <div className="flex-1 h-px bg-discord-border" />
                    </div>
                  )}
                  {group.items.map((m: any, idx: number) => {
                    const statusClass = m.status === 'pending' ? 'opacity-50' : m.status === 'failed' ? 'text-discord-danger' : '';
                    const rawUsername = (m as any).username ?? (typeof m.senderId !== 'undefined' ? `user-${m.senderId}` : 'yo');
                    const username = String(rawUsername);
                    const avatarInitial = (username || '?').toString().charAt(0).toUpperCase();
                    const showNewSeparator = m.id && lastReadId && m.id > lastReadId && !group.items.some((x: any) => x.id && x.id < m.id && x.id > lastReadId) && idx === 0 && group.day === group.day; // first message in group after lastRead
                    const reactions = (m as any).reactions || [];
                    const grouped = reactions.reduce((acc: Record<string, { emoji: string; count: number; mine: boolean }>, r: any) => {
                      const k = r.emoji;
                      if (!acc[k]) acc[k] = { emoji: k, count: 0, mine: r.userId === currentUserId };
                      acc[k].count++;
                      if (r.userId === currentUserId) acc[k].mine = true;
                      return acc;
                    }, {});
                    const reactionList: { emoji: string; count: number; mine: boolean }[] = Object.values(grouped);
                    return (
                      <div key={m.id || m.tempId || idx} className={`group flex gap-3 items-start pr-6 ${statusClass} rounded px-2 py-1 hover:bg-discord-bg-hover/30 relative`}> 
                        {showNewSeparator && (
                          <div className="absolute -top-4 left-0 right-0 flex items-center" aria-label="Nuevos mensajes">
                            <div className="flex-1 h-px bg-discord-danger/60" />
                            <span className="mx-2 text-[10px] font-semibold text-discord-danger uppercase tracking-wide bg-discord-bg-alt px-2 py-0.5 rounded">Nuevos</span>
                            <div className="flex-1 h-px bg-discord-danger/60" />
                          </div>
                        )}
                        <div className="w-8 h-8 rounded-full bg-discord-bg-hover flex items-center justify-center text-[13px] font-semibold text-discord-text select-none shrink-0">{avatarInitial}</div>
                        <div className="flex-1 leading-snug space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-discord-text">{username}</span>
                            {m.createdAt && <span className="text-[10px] text-discord-text-muted">{formatTime(m.createdAt as any)}</span>}
                          </div>
                          <div className="text-discord-text whitespace-pre-wrap break-words">
                            {m.content}
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
                          {reactionList.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {reactionList.map(r => (
                                <button key={r.emoji} onClick={() => r.mine ? removeReaction(m.id!, r.emoji) : addReaction(m.id!, r.emoji)} className={`px-2 h-6 rounded-full text-[11px] flex items-center gap-1 bg-discord-bg-hover hover:bg-discord-bg-hover/80 border border-discord-border ${r.mine ? 'ring-1 ring-discord-primary/60' : ''}`}>{r.emoji}<span className="text-discord-text-muted text-[10px]">{r.count}</span></button>
                              ))}
                            </div>
                          )}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 mt-1">
                            {['👍','🔥','😂','❤️'].map(e => (
                              <button key={e} onClick={() => addReaction(m.id!, e)} className="text-[12px] px-1 py-0.5 rounded hover:bg-discord-bg-hover/70">{e}</button>
                            ))}
                            {reactionList.some(r => r.mine) && <button onClick={() => reactionList.filter(r=>r.mine).forEach(r=>removeReaction(m.id!, r.emoji))} className="text-[10px] text-discord-text-muted hover:text-discord-danger px-1">Quitar</button>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
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
