import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import { useRouter } from 'next/router';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setTokens = useAuthStore(s => s.setTokens);
  const setUser = useAuthStore(s => s.setUser);
  const router = useRouter();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
  const data = await api.register(username, password);
  setTokens(data.accessToken, data.refreshToken);
  if (data.user) setUser({ id: data.user.id, username: data.user.username });
  else setUser({ id: -1, username });
      router.push('/channels');
    } catch (e: any) {
      setError(e.message || 'Error');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-discord-bg-dark p-4 text-discord-text">
      <form onSubmit={submit} className="w-full max-w-sm bg-discord-background shadow-inner-sm border border-discord-border rounded-lg p-6 space-y-4">
        <h1 className="text-xl font-semibold text-center">Crear cuenta</h1>
        {error && <p className="text-sm text-discord-danger text-center">{error}</p>}
        <div className="space-y-3">
          <input className="w-full bg-discord-input border border-discord-border focus:border-discord-primary/60 focus:ring-2 focus:ring-discord-primary/30 outline-none px-3 py-2 rounded text-sm" placeholder="Usuario" value={username} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setUsername(e.target.value)} />
          <input className="w-full bg-discord-input border border-discord-border focus:border-discord-primary/60 focus:ring-2 focus:ring-discord-primary/30 outline-none px-3 py-2 rounded text-sm" placeholder="Contraseña" type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setPassword(e.target.value)} />
        </div>
        <button className="w-full bg-discord-primary hover:bg-discord-primary/90 text-white py-2 rounded text-sm font-medium">Crear</button>
        <p className="text-xs text-discord-text-muted text-center">¿Ya tienes cuenta? <Link className="text-discord-primary hover:underline" href="/login">Inicia sesión</Link></p>
      </form>
    </div>
  );
}
