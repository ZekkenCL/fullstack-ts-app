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
      setUser({ username });
      router.push('/channels');
    } catch (e: any) {
      setError(e.message || 'Error');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white shadow rounded p-6 space-y-4">
        <h1 className="text-xl font-semibold">Registro</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
  <input className="w-full border px-3 py-2 rounded" placeholder="Username" value={username} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setUsername(e.target.value)} />
  <input className="w-full border px-3 py-2 rounded" placeholder="Password" type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setPassword(e.target.value)} />
        <button className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded">Crear</button>
        <p className="text-sm text-gray-600">¿Ya tienes cuenta? <Link className="text-blue-600" href="/login">Inicia sesión</Link></p>
      </form>
    </div>
  );
}
