import React, { useState } from 'react';
import { api } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import UserAvatar from './UserAvatar';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EditProfileModal: React.FC<Props> = ({ open, onClose }) => {
  const { user, setUser } = useAuthStore();
  const [username, setUsername] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (username.trim().length < 3) { setError('Mínimo 3 caracteres'); return; }
    setSaving(true);
    try {
      const res = await api.updateProfile({ username: username.trim() });
      setUser({ ...user, username: res.username });
      window.dispatchEvent(new CustomEvent('username-updated', { detail: { userId: user.id, username: res.username } }));
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e=>e.stopPropagation()} onSubmit={submit} className="w-full max-w-md bg-discord-background border border-discord-border rounded-lg shadow-xl p-5 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-discord-text">Editar perfil</h2>
        <div className="flex items-center gap-4">
          <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={64} />
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] uppercase tracking-wide text-discord-text-muted mb-1">Nombre de usuario</label>
            <input
              value={username}
              onChange={e=>setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded bg-discord-input border border-discord-border text-sm focus:outline-none focus:ring-2 focus:ring-discord-primary/40"
              maxLength={32}
              placeholder="tu-nombre"
            />
            <p className="text-[10px] mt-1 text-discord-text-muted">3-32 caracteres. Se actualizará en tus mensajes futuros.</p>
          </div>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded bg-discord-bg-hover hover:bg-discord-bg-hover/70">Cancelar</button>
          <button disabled={saving} type="submit" className="text-sm px-4 py-2 rounded bg-discord-primary hover:bg-discord-primary/90 text-white disabled:opacity-50">{saving? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
};

export default EditProfileModal;
