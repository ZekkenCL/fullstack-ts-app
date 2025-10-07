import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import UserAvatar from './UserAvatar';

interface HoverUserData { id: number; username: string; role?: string; avatarUrl?: string | null; online?: boolean }
interface UserHoverCardProps {
  user: HoverUserData;
  x: number;
  y: number;
  onClose: () => void;
  onMention?: (username: string) => void;
  currentUserId?: number | null;
}

// Portal helper (simple: appends to body)
const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const elRef = useRef<HTMLElement | null>(null);
  if (!elRef.current && typeof document !== 'undefined') {
    elRef.current = document.createElement('div');
  }
  useEffect(() => {
    if (!elRef.current) return;
    document.body.appendChild(elRef.current);
    return () => { if (elRef.current) document.body.removeChild(elRef.current); };
  }, []);
  if (!elRef.current) return null;
  return ReactDOM.createPortal(children, elRef.current);
};

function gradientFromName(name: string) {
  let h = 0; for (let i=0;i<name.length;i++) h = (h*31 + name.charCodeAt(i)) >>> 0;
  const h1 = h % 360; const h2 = (h + 90) % 360;
  return `linear-gradient(135deg,hsl(${h1} 65% 45%),hsl(${h2} 65% 35%))`;
}

export const UserHoverCard: React.FC<UserHoverCardProps> = ({ user, x, y, onClose, onMention, currentUserId }) => {
  // Close on escape or click outside
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e: MouseEvent) => { if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, [onClose]);

  const style: React.CSSProperties = { position: 'fixed', top: y + 8, left: x, zIndex: 1000 };

  // After mount adjust if overflowing viewport
  useEffect(() => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    let nx = rect.left; let ny = rect.top;
    if (rect.right > window.innerWidth) nx = Math.max(8, window.innerWidth - rect.width - 8);
    if (rect.bottom > window.innerHeight) ny = Math.max(8, window.innerHeight - rect.height - 8);
    cardRef.current.style.left = nx + 'px';
    cardRef.current.style.top = ny + 'px';
  }, []);

  return (
    <Portal>
      <div ref={cardRef} style={style} className="w-80 bg-discord-background border border-discord-border rounded-lg shadow-xl overflow-hidden animate-fade-in">
        {/* Banner */}
        <div className="h-20 w-full relative" style={{ background: gradientFromName(user.username) }}>
          <div className="absolute -bottom-10 left-4">
            <div className="relative">
              <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={72} className="ring-4 ring-discord-background" />
              <span className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-discord-background ${user.online ? 'bg-green-500' : 'bg-gray-500'}`}></span>
            </div>
          </div>
        </div>
        <div className="pt-12 px-4 pb-4">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-discord-text truncate">{user.username}</p>
            {user.role && (
              <span className="text-[10px] uppercase tracking-wide font-semibold text-[#e3b341]">{user.role}</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {user.role && (
              <span className="text-[10px] px-2 py-1 rounded bg-[#e3b341]/20 text-[#e3b341] font-medium uppercase tracking-wide">{user.role}</span>
            )}
            {/* Placeholder para más badges futuros */}
          </div>
          <div className="mt-3 text-[11px] text-discord-text-muted leading-snug space-y-1">
            <p>ID: {user.id}</p>
            <p>Estado: {user.online ? 'En línea' : 'Desconectado'}</p>
          </div>
          {onMention && currentUserId !== user.id && (
            <button
              onClick={() => { onMention(user.username); onClose(); }}
              className="mt-4 w-full text-sm font-medium bg-discord-primary hover:bg-discord-primary/90 text-white py-2 rounded transition-colors"
            >
              Mensaje @{user.username}
            </button>
          )}
          {currentUserId === user.id && (
            <button
              onClick={() => { /* TODO: abrir modal edición perfil */ onClose(); }}
              className="mt-4 w-full text-sm font-medium bg-discord-bg-hover hover:bg-discord-bg-hover/70 text-discord-text py-2 rounded border border-discord-border transition-colors"
            >
              Editar perfil
            </button>
          )}
        </div>
      </div>
    </Portal>
  );
};

export default UserHoverCard;
