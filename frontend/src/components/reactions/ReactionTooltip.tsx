import React, { useEffect, useRef } from 'react';

interface ReactionTooltipProps {
  x: number;
  y: number;
  users: { username: string }[];
  emoji: string;
  onClose: () => void;
}

export const ReactionTooltip: React.FC<ReactionTooltipProps> = ({ x, y, users, emoji, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as any)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <div ref={ref} style={{ top: y + 8, left: x }} className="fixed z-50 px-3 py-2 rounded-md bg-discord-bg-alt border border-discord-border shadow text-[11px] max-w-[220px]">
      <div className="mb-1 font-semibold flex items-center gap-1">{emoji}<span className="text-discord-text-muted font-normal">{users.length}</span></div>
      <div className="flex flex-wrap gap-1">
        {users.map(u => (
          <span key={u.username} className="px-1 py-0.5 rounded bg-discord-bg-hover text-discord-text">{u.username}</span>
        ))}
      </div>
    </div>
  );
};