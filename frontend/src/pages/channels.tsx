import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/apiClient';
import { useChannel, useChannelPresence } from '../lib/socket';

interface Channel { id: number; name: string }

export default function ChannelsPage() {
  const { accessToken, user, clear } = useAuthStore();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const { messages, sendMessage } = useChannel(activeChannelId);
  const presence = useChannelPresence(activeChannelId);
  const [draft, setDraft] = useState('');

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

  const selectChannel = (id: number) => {
    setActiveChannelId(id);
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
              {channels.map(c => (
                <li key={c.id} className={`border bg-white rounded p-3 flex justify-between items-center ${activeChannelId===c.id ? 'ring-2 ring-blue-500' : ''}`}>
                  <button className="flex-1 text-left" onClick={() => { api.joinChannel(c.id); selectChannel(c.id); }}>{c.name}</button>
                </li>
              ))}
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
                <div className="flex-1 overflow-auto px-4 py-3 space-y-2">
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
                  {messages.length === 0 && <p className="text-xs text-gray-500">Sin mensajes aún.</p>}
                  {messages.map((m, idx) => (
                    <div key={m.id || idx} className="text-sm"><span className="text-gray-600">{m.senderId || '¿'}</span>: {m.content}</div>
                  ))}
                </div>
                <div className="border-t p-2 flex gap-2">
                  <input value={draft} onChange={(e)=>setDraft(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } }} className="flex-1 border px-3 py-2 rounded" placeholder="Escribe un mensaje" />
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
