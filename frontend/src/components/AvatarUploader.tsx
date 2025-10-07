import React, { useRef, useState } from 'react';
import { api } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import UserAvatar from './UserAvatar';

interface Props { className?: string }

export const AvatarUploader: React.FC<Props> = ({ className='' }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { user, setUser } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 2 * 1024 * 1024) { setError('Máx 2MB'); return; }
    setUploading(true);
    try {
  const res = await api.uploadAvatar(file);
  const bust = res.avatarUrl + (res.avatarUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
  setUser({ ...user, avatarUrl: bust });
  // Emitir evento global para que páginas puedan actualizar mensajes existentes
  try {
    window.dispatchEvent(new CustomEvent('avatar-updated', { detail: { userId: user.id, avatarUrl: bust } }));
  } catch {}
    } catch (err: any) {
      setError(err?.message || 'Error al subir');
    } finally { setUploading(false); }
  };
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="relative group">
        <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={64} />
        <button
          type="button"
          onClick={()=>inputRef.current?.click()}
          className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white transition"
          title="Cambiar avatar"
        >{uploading ? '...' : 'Editar'}</button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onSelect} />
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <p className="text-[10px] text-discord-text-muted">PNG/JPG, máx 2MB</p>
    </div>
  );
};

export default AvatarUploader;