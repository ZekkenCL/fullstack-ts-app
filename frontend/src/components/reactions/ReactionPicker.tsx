import React, { useEffect, useRef } from 'react';

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  common?: string[];
  x?: number;
  y?: number;
}

// Lightweight popover emoji picker (simple grid of common emojis)
export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, onClose, common = ['👍','🔥','😂','❤️','😮','🎉','😢','👏','✅','❌'], x=0, y=0 }) => {
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
    <div ref={ref} style={{ top: y, left: x }} className="fixed z-50 bg-discord-bg-alt border border-discord-border rounded-md shadow-lg p-2 w-48 grid grid-cols-6 gap-1">
      {common.map(e => (
        <button key={e} onClick={() => { onSelect(e); onClose(); }} className="h-8 w-8 text-lg flex items-center justify-center rounded hover:bg-discord-bg-hover/70 focus:outline-none focus:ring-2 focus:ring-discord-primary/40">
          {e}
        </button>
      ))}
      <div className="col-span-6 mt-1 text-[10px] text-discord-text-muted text-center">(Básico)</div>
    </div>
  );
};
