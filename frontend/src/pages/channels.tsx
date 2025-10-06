import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ReactionChip } from '../components/reactions/ReactionChip';
import { ReactionTooltip } from '../components/reactions/ReactionTooltip';
import { ReactionPicker } from '../components/reactions/ReactionPicker';
import { renderMarkdown, renderMarkdownAsync } from '../lib/markdown';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/apiClient';
import { socketManager } from '../lib/socket';
import { useChannel, useChannelPresence, useTyping } from '../lib/socket';
import { useMessagesStore } from '../store/messagesStore';
import { Virtuoso } from 'react-virtuoso';

import type { SharedChannel } from '../../../shared/src/types';
interface Channel extends SharedChannel { unread?: number; myRole?: string }

export default function ChannelsPage() {
  const { accessToken, user, clear } = useAuthStore();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const { messages, sendMessage, resendMessage, addReaction, removeReaction, editMessage, deleteMessage } = useChannel(activeChannelId);
  const msgStore = useMessagesStore();
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const presence = useChannelPresence(activeChannelId);
  const currentUserId = user?.id; // ahora viene del auth store

  // TODO: Próximo paso: componente ReactionPicker flotante y tooltips de usuarios que reaccionaron
  const { typingUsers, emitTyping } = useTyping(activeChannelId);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null); // scroller ref (Virtuoso)
  const virtuosoRef = useRef<any>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newSince, setNewSince] = useState(0);
  const [picker, setPicker] = useState<{ x: number; y: number; messageId: number } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchCursor, setSearchCursor] = useState<number | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [globalSearch, setGlobalSearch] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  // Reacciones tooltip
  const [reactionHover, setReactionHover] = useState<{ emoji: string; users: { username: string }[]; x: number; y: number } | null>(null);
  const reactionCacheRef = useRef<Record<string, { usernames: string[]; last: number }>>({}); // key = messageId|emoji
  // Mentions state
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<{ id: number; username: string; role: string }[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const mentionIndexRef = useRef(0);
  const mentionAnchorRef = useRef<HTMLDivElement | null>(null);

  // Fetch mention suggestions (debounced)
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!activeChannelId || !mentionQuery) { setMentionResults([]); return; }
      try {
        const res = await api.channelMembers(activeChannelId, mentionQuery);
        if (active) setMentionResults(res.slice(0, 20));
      } catch { if (active) setMentionResults([]); }
    };
    const t = setTimeout(run, 140);
    return () => { active = false; clearTimeout(t); };
  }, [mentionQuery, activeChannelId]);

  const applyMention = (username: string) => {
    // Replace trailing @query with @username + space
    setDraft(prev => prev.replace(/(^|\s)@([\w-]*)$/, (full, g1) => `${g1}@${username} `));
    setShowMentions(false);
    setMentionQuery('');
  };

  const runSearch = async (reset = true) => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      let res;
      if (globalSearch) {
        res = await api.globalSearch(searchQuery.trim(), { cursor: reset ? undefined : searchCursor || undefined, limit: 40 });
      } else if (activeChannelId) {
        res = await api.searchChannel(activeChannelId, searchQuery.trim(), { cursor: reset ? undefined : searchCursor || undefined, limit: 30 });
      } else {
        setSearchResults([]); setSearchCursor(null); return;
      }
      if (reset) {
        setSearchResults(res.items || []);
      } else {
        setSearchResults(prev => [...prev, ...(res.items||[])]);
      }
      setSearchCursor(res.nextCursor);
    } catch {} finally { setSearchLoading(false); }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  
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

  // Last read id to decide "Nuevos" insertion
  const lastReadId = activeChannelId ? (msgStore.lastRead[activeChannelId] || 0) : 0;

  interface DayItem { type: 'day'; day: string }
  interface NewSeparatorItem { type: 'new-separator'; key: string }
  interface MessageItem { type: 'message'; m: any; day: string; compact: boolean }
  type RenderItem = DayItem | NewSeparatorItem | MessageItem;

  const renderItems: RenderItem[] = useMemo(() => {
    const out: RenderItem[] = [];
    const COMPACT_WINDOW_MS = 5 * 60 * 1000; // 5 min
    let lastDay: string | null = null;
    let prevMessage: any | null = null;
    let insertedNewSep = false;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const day = formatDay(m.createdAt as any);
      if (day !== lastDay) {
        lastDay = day;
        out.push({ type: 'day', day });
        prevMessage = null; // reset compaction across days
      }
      // Determine if we must insert "Nuevos" separator BEFORE this message
      if (!insertedNewSep && lastReadId && m.id && m.id > lastReadId) {
        out.push({ type: 'new-separator', key: `new-${m.id}` });
        insertedNewSep = true;
      }
      let compact = false;
      if (prevMessage && prevMessage.senderId === m.senderId && prevMessage.createdAt && m.createdAt) {
        const prevTime = new Date(prevMessage.createdAt).getTime();
        const currTime = new Date(m.createdAt).getTime();
        if (currTime - prevTime <= COMPACT_WINDOW_MS) compact = true;
      }
      out.push({ type: 'message', m, day, compact });
      prevMessage = m;
    }
    return out;
  }, [messages, lastReadId]);

  const toggleReaction = async (messageId: number, emoji: string) => {
    try {
      await fetch(`/messages/${messageId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ emoji }) });
    } catch {}
  };

  // History loading now handled in Virtuoso startReached

  useEffect(() => {
    if (autoScroll) {
      // Scroll al final usando Virtuoso
      try {
        virtuosoRef.current?.scrollToIndex?.({ index: renderItems.length - 1, align: 'end', behavior: 'auto' });
      } catch {}
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
    try { virtuosoRef.current?.scrollToIndex?.({ index: renderItems.length - 1, align: 'end', behavior: 'auto' }); } catch {}
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
      .then(async data => { 
        if (!mounted) return; 
        setChannels(data); 
        setLoading(false);
        try {
          const agg = await api.aggregatedUnreads();
          if (!mounted) return;
          if (Array.isArray(agg)) {
            setChannels(prev => prev.map(c => {
              const found = agg.find((a:any)=>a.channelId === c.id);
              if (found) return { ...c, unread: found.unread };
              return c;
            }));
            // Sync lastRead map locally también
            agg.forEach((a:any) => { if (a.lastReadMessageId) msgStore.markRead(a.channelId, a.lastReadMessageId); });
          }
        } catch {}
      })
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

  const handleChannelClick = async (c: Channel) => {
    try {
      const membership = await api.joinChannel(c.id); // returns role
      setChannels(prev => prev.map(ch => ch.id === c.id ? { ...ch, myRole: membership.role } : ch));
    } catch {}
    selectChannel(c.id);
  };

  if (!accessToken) return null;
  return (
    <>
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
              <div key={c.id} className={`group w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm transition-colors hover:bg-discord-bg-hover ${active ? 'bg-discord-bg-hover text-discord-text' : 'text-discord-text-muted'} ${unread>0 && !active ? 'font-medium text-discord-text' : ''}`}>
                <button onClick={() => handleChannelClick(c)} className="flex-1 flex items-center gap-2 overflow-hidden">
                  <span className="text-discord-text-muted group-hover:text-discord-text">#</span>
                  {renamingId === c.id ? (
                    <form onSubmit={async e => { e.preventDefault(); if (renameDraft.trim()) { try { const updated = await api.updateChannel(c.id, renameDraft.trim()); setChannels(prev => prev.map(ch => ch.id === c.id ? { ...ch, name: updated.name } : ch)); setRenamingId(null); } catch {} } }} className="flex-1">
                      <input autoFocus value={renameDraft} onChange={e=>setRenameDraft(e.target.value)} onKeyDown={e=>{ if(e.key==='Escape'){ setRenamingId(null); } }} className="w-full bg-discord-input text-xs px-1 py-0.5 rounded outline-none" />
                    </form>
                  ) : (
                    <span className="flex-1 truncate">{c.name}</span>
                  )}
                  {unread>0 && !active && (
                    <span data-testid={`unread-${c.name}`} className="ml-auto bg-discord-channel-unread-pill text-[10px] leading-none px-2 py-0.5 rounded-full font-semibold text-white">{unread}</span>
                  )}
                </button>
                {c.myRole === 'owner' && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Eliminar canal "${c.name}"? Esta acción es permanente.`)) return;
                      try {
                        await api.deleteChannel(c.id);
                        setChannels(prev => prev.filter(ch => ch.id !== c.id));
                        if (activeChannelId === c.id) setActiveChannelId(null);
                      } catch (err) {
                        // error toast global ya
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 text-discord-text-muted hover:text-discord-danger text-xs px-1"
                    title="Eliminar canal"
                  >✕</button>
                )}
                {c.myRole === 'owner' && renamingId !== c.id && (
                  <button onClick={(e)=>{ e.stopPropagation(); setRenamingId(c.id); setRenameDraft(c.name); }} className="opacity-0 group-hover:opacity-100 text-discord-text-muted hover:text-discord-text text-xs px-1" title="Renombrar">✎</button>
                )}
                {c.myRole && c.myRole !== 'owner' && (
                  <button onClick={async (e)=>{ e.stopPropagation(); if(!confirm('Salir de este canal?')) return; try { await api.leaveChannel(c.id); setChannels(prev=> prev.filter(ch=>ch.id!==c.id)); if(activeChannelId===c.id) setActiveChannelId(null); } catch {} }} className="opacity-0 group-hover:opacity-100 text-discord-text-muted hover:text-discord-danger text-xs px-1" title="Salir">↩</button>
                )}
              </div>
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
              <button onClick={() => { setShowSearch(true); setGlobalSearch(false); setTimeout(()=>{ const el=document.getElementById('channel-search-input'); el?.focus(); }, 10); }} className="ml-4 text-[11px] px-2 py-1 rounded bg-discord-bg-hover hover:bg-discord-bg-hover/70 text-discord-text-muted hover:text-discord-text">Buscar</button>
              <span className="ml-4 text-[11px] font-normal text-discord-text-muted">{presence.length} conectados</span>
            </div>
          ) : <span className="text-sm text-discord-text-muted">Selecciona un canal</span>}
        </header>
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 flex flex-col">
            <div className="flex-1 relative">
              <Virtuoso
                ref={virtuosoRef}
                data={renderItems}
                totalCount={renderItems.length}
                className="px-4 py-3 text-sm"
                atBottomStateChange={(atBottom) => { setAutoScroll(atBottom); if (atBottom) setNewSince(0); }}
                startReached={async () => {
                  if (!activeChannelId || loadingHistory || !historyCursor) return;
                  if (!listRef.current) return;
                  setLoadingHistory(true);
                  const el = listRef.current;
                  const prevHeight = el.scrollHeight;
                  try {
                    const res = await api.channelMessages(activeChannelId, { cursor: historyCursor, limit: 30 });
                    if (res.items && res.items.length) {
                      const existing = msgStore.byChannel[activeChannelId] || [];
                      const merged = [...res.items, ...existing];
                      msgStore.setChannel(activeChannelId, merged);
                      setHistoryCursor(res.nextCursor);
                      requestAnimationFrame(() => {
                        const newHeight = el.scrollHeight;
                        el.scrollTop = newHeight - prevHeight; // anchor
                      });
                    } else {
                      setHistoryCursor(null);
                    }
                  } catch {
                    setHistoryCursor(null);
                  } finally {
                    setLoadingHistory(false);
                  }
                }}
                itemContent={(idx, item: any) => {
                  if (item.type === 'day') {
                    return (
                      <div className="flex items-center my-4">
                        <div className="flex-1 h-px bg-discord-border" />
                        <span className="mx-4 text-[11px] uppercase tracking-wide text-discord-text-muted">{item.day}</span>
                        <div className="flex-1 h-px bg-discord-border" />
                      </div>
                    );
                  }
                  if (item.type === 'new-separator') {
                    return (
                      <div className="flex items-center my-2" aria-label="Nuevos mensajes">
                        <div className="flex-1 h-px bg-discord-danger/60" />
                        <span className="mx-2 text-[10px] font-semibold text-discord-danger uppercase tracking-wide bg-discord-bg-alt px-2 py-0.5 rounded">Nuevos</span>
                        <div className="flex-1 h-px bg-discord-danger/60" />
                      </div>
                    );
                  }
                  const { m, compact } = item;
                  const statusClass = m.status === 'pending' ? 'opacity-50' : m.status === 'failed' ? 'text-discord-danger' : '';
                  const rawUsername = (m as any).username ?? (typeof m.senderId !== 'undefined' ? `user-${m.senderId}` : 'yo');
                  const username = String(rawUsername);
                  const avatarInitial = (username || '?').toString().charAt(0).toUpperCase();
                  const reactions = (m as any).reactions || [];
                  const grouped = reactions.reduce((acc: Record<string, { emoji: string; count: number; mine: boolean; users: { id: number; username: string }[] }>, r: any) => {
                    const k = r.emoji;
                    if (!acc[k]) acc[k] = { emoji: k, count: 0, mine: r.userId === currentUserId, users: [] };
                    acc[k].count++;
                    acc[k].users.push({ id: r.userId, username: r.username || `user-${r.userId}` });
                    if (r.userId === currentUserId) acc[k].mine = true;
                    return acc;
                  }, {});
                  const reactionList: { emoji: string; count: number; mine: boolean; users: { id: number; username: string }[] }[] = Object.values(grouped);
                  const [rendered, setRendered] = React.useState<string | null>(null);
                  React.useEffect(() => {
                    let active = true;
                    renderMarkdownAsync(m.content || '').then(html => { if (active) setRendered(html); }).catch(()=>{});
                    return () => { active = false; };
                  }, [m.content]);
                  return (
                    <div data-mid={m.id} className={`group flex items-start pr-6 ${statusClass} rounded px-2 py-0.5 hover:bg-discord-bg-hover/30 relative`}> 
                      {!compact && (
                        <div className="w-8 mt-1 h-8 mr-3 rounded-full bg-discord-bg-hover flex items-center justify-center text-[13px] font-semibold text-discord-text select-none shrink-0">{avatarInitial}</div>
                      )}
                      {compact && <div className="w-8 mr-3" />}
                      <div className={`flex-1 leading-snug ${compact ? '' : 'space-y-0.5'}`}>
                        {!compact && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-discord-text">{username}</span>
                            {m.createdAt && <span className="text-[10px] text-discord-text-muted">{formatTime(m.createdAt as any)}</span>}
                            {m.updatedAt && <span className="text-[9px] text-discord-text-muted italic">(editado)</span>}
                          </div>
                        )}
                        {editingId === m.id ? (
                          <form onSubmit={e => { e.preventDefault(); if (editingText.trim()) { editMessage(m.id!, editingText.trim()); setEditingId(null); } }} className="mt-0.5">
                            <input autoFocus value={editingText} onChange={e=>setEditingText(e.target.value)} onKeyDown={e=>{ if(e.key==='Escape'){ setEditingId(null); setEditingText(''); } }} className="w-full bg-discord-input border border-discord-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-discord-primary/50" />
                            <div className="flex gap-2 mt-1">
                              <button type="submit" className="text-[10px] bg-discord-primary/70 hover:bg-discord-primary text-white px-2 py-0.5 rounded">Guardar</button>
                              <button type="button" onClick={()=>{ setEditingId(null); setEditingText(''); }} className="text-[10px] text-discord-text-muted hover:text-discord-danger">Cancelar</button>
                            </div>
                          </form>
                        ) : (
                          <div className={`${compact ? 'pl-0' : ''}`}>
                            <div className="prose prose-invert max-w-none text-discord-text break-words text-sm" dangerouslySetInnerHTML={{ __html: rendered || renderMarkdown(m.content || '') }} />
                            {m.status === 'pending' && (
                              <span className="ml-2 text-[10px] text-discord-text-muted">
                                enviando… {typeof (m as any).attempt === 'number' && m.attempt! > 0 && `(${m.attempt}/${m.maxAttempts})`}
                              </span>
                            )}
                            {m.status === 'failed' && (
                              <span className="ml-2 text-[10px] flex items-center gap-2 text-discord-danger">
                                falló {typeof (m as any).attempt === 'number' && m.maxAttempts ? `(${Math.min((m as any).attempt, (m as any).maxAttempts)}/${(m as any).maxAttempts})` : ''}
                                {m.tempId && (
                                  <button onClick={() => resendMessage(m.tempId!)} className="underline hover:text-white">reintentar</button>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                        {reactionList.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {reactionList.map(r => {
                              const handleHover = async (emoji: string, rect: DOMRect) => {
                                if (!m.id) return;
                                const key = `${m.id}|${emoji}`;
                                const cached = reactionCacheRef.current[key];
                                let usernames: string[] = [];
                                if (cached && Date.now() - cached.last < 15000) {
                                  usernames = cached.usernames;
                                } else {
                                  // Si ya tenemos usernames completos en r.users los usamos; si detectamos placeholders, hacemos fetch
                                  const rawUsernames = r.users.map(u => u.username);
                                  const needFetch = rawUsernames.some(name => /^user-\d+$/.test(name));
                                  if (needFetch) {
                                    try {
                                      const res = await fetch(`/messages/${m.id}/reactions`, { headers: { Authorization: `Bearer ${accessToken}` } });
                                      if (res.ok) {
                                        const data = await res.json();
                                        usernames = data.filter((d: any) => d.emoji === emoji).map((d: any) => d.user?.username || `user-${d.userId}`);
                                      } else {
                                        usernames = rawUsernames;
                                      }
                                    } catch { usernames = rawUsernames; }
                                  } else {
                                    usernames = rawUsernames;
                                  }
                                  reactionCacheRef.current[key] = { usernames, last: Date.now() };
                                }
                                setReactionHover({ emoji, users: usernames.map(u => ({ username: u })), x: rect.left, y: rect.top });
                              };
                              return (
                                <ReactionChip
                                  key={r.emoji}
                                  emoji={r.emoji}
                                  count={r.count}
                                  mine={r.mine}
                                  onClick={() => r.mine ? removeReaction(m.id!, r.emoji) : addReaction(m.id!, r.emoji)}
                                  onHoverUsers={(emoji, rect) => handleHover(emoji, rect)}
                                  onLeave={() => setReactionHover(prev => prev && prev.emoji === r.emoji ? null : prev)}
                                />
                              );
                            })}
                          </div>
                        )}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 mt-1 items-center">
                          <button
                            onClick={(e) => {
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                              setPicker({ x: rect.left, y: rect.bottom + 4, messageId: m.id! });
                            }}
                            className="text-[11px] px-2 h-6 rounded-full bg-discord-bg-hover hover:bg-discord-bg-hover/70 border border-discord-border"
                            title="Agregar reacción"
                          >➕</button>
                          {m.id && m.senderId && user?.id === m.senderId && editingId !== m.id && (
                            <>
                              <button onClick={() => { setEditingId(m.id!); setEditingText(m.content || ''); }} className="text-[10px] text-discord-text-muted hover:text-discord-text px-1" title="Editar">Editar</button>
                              <button onClick={() => { if(confirm('Eliminar mensaje?')) deleteMessage(m.id!); }} className="text-[10px] text-discord-text-muted hover:text-discord-danger px-1" title="Eliminar">Eliminar</button>
                            </>
                          )}
                          {reactionList.some(r => r.mine) && (
                            <button
                              onClick={() => reactionList.filter(r=>r.mine).forEach(r=>removeReaction(m.id!, r.emoji))}
                              className="text-[10px] text-discord-text-muted hover:text-discord-danger px-1"
                            >Quitar</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }}
                components={{
                  Header: () => (
                    <div>
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
                    </div>
                  ),
                  Footer: () => (
                    <div>
                      {typingUsers.length > 0 && (
                        <div className="mt-2 text-[11px] text-discord-text-muted flex items-center gap-2">
                          {typingUsers.slice(0,3).map(u => u.username).join(', ')} {typingUsers.length>3 ? `+${typingUsers.length-3}`: ''} está{typingUsers.length>1?'n':''} escribiendo…
                          <span className="inline-block animate-pulse">•••</span>
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              {!autoScroll && newSince > 0 && (
                <button onClick={scrollToBottom} className="absolute bottom-2 right-4 bg-discord-primary hover:bg-discord-primary/90 text-white text-xs px-3 py-1 rounded shadow">
                  {newSince} nuevo{newSince>1?'s':''} ↓
                </button>
              )}
            </div>
            {activeChannelId && (
              <div className="p-3 border-t border-discord-border bg-discord-bg-alt flex gap-2">
                <div className="relative flex-1" ref={mentionAnchorRef}>
                  <input
                    value={draft}
                    onChange={(e)=>{
                      const val = e.target.value;
                      setDraft(val); emitTyping(true);
                      // Detect mention trigger
                      const match = /(^|\s)@([\w-]{1,})$/.exec(val);
                      if (match) {
                        setMentionQuery(match[2]);
                        setShowMentions(true);
                        mentionIndexRef.current = 0;
                      } else {
                        setShowMentions(false);
                        setMentionQuery('');
                      }
                    }}
                    onBlur={()=>setTimeout(()=>{ emitTyping(false); setShowMentions(false); }, 150)}
                    onKeyDown={e=>{
                      if (showMentions && mentionResults.length) {
                        if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndexRef.current = (mentionIndexRef.current + 1) % mentionResults.length; setMentionResults(r=>[...r]); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); mentionIndexRef.current = (mentionIndexRef.current - 1 + mentionResults.length) % mentionResults.length; setMentionResults(r=>[...r]); }
                        else if (e.key === 'Tab') { e.preventDefault(); applyMention(mentionResults[mentionIndexRef.current].username); }
                        else if (e.key === 'Enter' && !e.shiftKey) {
                          if (mentionQuery) { // choose highlight if currently in mention mode
                            const chosen = mentionResults[mentionIndexRef.current];
                            if (chosen) { e.preventDefault(); applyMention(chosen.username); return; }
                          }
                        } else if (e.key === 'Escape') { setShowMentions(false); }
                      }
                      if(e.key==='Enter' && !e.shiftKey && !showMentions){ e.preventDefault(); emitTyping(false); send(); }
                    }}
                    className="w-full bg-discord-input border border-discord-border rounded px-3 py-2 text-sm placeholder:text-discord-text-muted focus:outline-none focus:ring-2 focus:ring-discord-primary/40"
                    placeholder="Enviar mensaje (usa @ para mencionar)"
                  />
                  {showMentions && mentionResults.length > 0 && (
                    <div className="absolute bottom-full mb-1 left-0 w-64 max-h-60 overflow-y-auto bg-discord-bg-alt border border-discord-border rounded shadow-lg text-xs py-1 z-50">
                      {mentionResults.map((u, idx) => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={(e)=>{ e.preventDefault(); applyMention(u.username); }}
                          className={`w-full flex items-center justify-between px-3 py-1 text-left hover:bg-discord-bg-hover ${idx===mentionIndexRef.current ? 'bg-discord-bg-hover/70 text-discord-text' : 'text-discord-text-muted'}`}
                        >
                          <span>@{u.username}</span>
                          {u.role === 'owner' && <span className="text-[9px] uppercase text-discord-primary font-semibold">owner</span>}
                        </button>
                      ))}
                      {mentionResults.length === 0 && (
                        <div className="px-3 py-2 text-discord-text-muted">Sin coincidencias</div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={send} className="bg-discord-primary hover:bg-discord-primary/90 text-white px-4 py-2 rounded text-sm font-medium">Enviar</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    {picker && (
      <ReactionPicker
        x={picker.x}
        y={picker.y}
        onSelect={(emoji) => { if (picker) addReaction(picker.messageId, emoji); }}
        onClose={() => setPicker(null)}
      />
    )}
    {showSearch && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20" onClick={()=>setShowSearch(false)}>
        <div className="w-full max-w-2xl bg-discord-background border border-discord-border rounded-lg shadow-xl flex flex-col max-h-[70vh]" onClick={e=>e.stopPropagation()}>
          <div className="p-3 border-b border-discord-border flex items-center gap-2">
            <input id="channel-search-input" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ runSearch(true); } }} placeholder={globalSearch ? "Buscar global (Enter para buscar, Esc para cerrar)" : "Buscar en canal (Enter para buscar, Esc para cerrar)"} className="flex-1 bg-discord-input border border-discord-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-discord-primary/40" />
            <button onClick={()=>{ setGlobalSearch(g=>!g); setSearchResults([]); setSearchCursor(null); }} className={`text-xs px-2 py-1 rounded border border-discord-border ${globalSearch ? 'bg-discord-primary text-white' : 'bg-discord-bg-hover text-discord-text-muted hover:text-discord-text'}`}>{globalSearch ? 'Global' : 'Canal'}</button>
            <button disabled={searchLoading} onClick={()=>runSearch(true)} className="text-sm px-3 py-2 rounded bg-discord-primary hover:bg-discord-primary/90 text-white">{searchLoading?'...':'Buscar'}</button>
            <button onClick={()=>setShowSearch(false)} className="text-xs text-discord-text-muted hover:text-discord-danger">Cerrar</button>
          </div>
          <div className="overflow-y-auto px-4 py-3 space-y-2 text-sm">
            {searchResults.length === 0 && !searchLoading && <p className="text-[11px] text-discord-text-muted">Sin resultados.</p>}
            {searchResults.map(r => (
              <button key={r.id} onClick={() => {
                setShowSearch(false);
                // Intentar scroll en la lista principal si existe
                const target = document.querySelector(`[data-mid='${r.id}']`);
                if (target && target instanceof HTMLElement) {
                  target.scrollIntoView({ block: 'center' });
                  target.classList.add('ring-1','ring-discord-primary');
                  setTimeout(()=>target.classList.remove('ring-1','ring-discord-primary'), 1400);
                } else {
                  // fallback: si no está cargado, puedes implementar fetch y luego posicionar (pendiente)
                }
              }} className="w-full text-left p-2 rounded hover:bg-discord-bg-hover/40 border border-transparent hover:border-discord-border">
                <div className="flex items-center gap-2 text-[11px] text-discord-text-muted mb-0.5">
                  <span>ID {r.id}</span>
                  {globalSearch && <span className="px-1 rounded bg-discord-bg-hover text-[10px]">ch {r.channelId}</span>}
                  <span>{new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="truncate text-discord-text" dangerouslySetInnerHTML={{ __html: (r.highlight ? r.highlight : renderMarkdown(r.content || '')) }} />
              </button>
            ))}
            {searchCursor && !searchLoading && (
              <button onClick={()=>runSearch(false)} className="text-[11px] px-3 py-1 rounded bg-discord-bg-hover hover:bg-discord-bg-hover/70">Cargar más</button>
            )}
            {searchLoading && <p className="text-[11px] text-discord-text-muted">Buscando...</p>}
          </div>
        </div>
      </div>
    )}
    {reactionHover && (
      <ReactionTooltip
        x={reactionHover.x}
        y={reactionHover.y}
        emoji={reactionHover.emoji}
        users={reactionHover.users}
        onClose={() => setReactionHover(null)}
      />
    )}
    </>
  );
}
