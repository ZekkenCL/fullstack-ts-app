import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/apiClient';

interface Channel { id: number; name: string }

export default function ChannelsPage() {
  const { accessToken, user, clear } = useAuthStore();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

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
        <ul className="space-y-2">
          {channels.map(c => (
            <li key={c.id} className="border bg-white rounded p-3 flex justify-between items-center">
              <span>{c.name}</span>
              <button className="text-blue-600 text-sm" onClick={() => api.joinChannel(c.id)}>Unirse</button>
            </li>
          ))}
          {!loading && channels.length === 0 && <li className="text-sm text-gray-500">No hay canales.</li>}
        </ul>
      </main>
    </div>
  );
}
