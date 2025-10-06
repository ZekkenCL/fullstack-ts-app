import React from 'react';

interface ReactionChipProps {
  emoji: string;
  count: number;
  mine?: boolean;
  onClick?: () => void;
  onHoverUsers?: (emoji: string, anchor: DOMRect) => void;
  onLeave?: () => void;
}

export const ReactionChip: React.FC<ReactionChipProps> = ({ emoji, count, mine, onClick, onHoverUsers, onLeave }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={(e) => { if (onHoverUsers) onHoverUsers(emoji, (e.currentTarget as HTMLElement).getBoundingClientRect()); }}
      onMouseLeave={() => { if (onLeave) onLeave(); }}
      className={`px-2 h-6 rounded-full text-[11px] flex items-center gap-1 bg-discord-bg-hover hover:bg-discord-bg-hover/80 border border-discord-border transition ${mine ? 'ring-1 ring-discord-primary/60' : ''}`}
    >
      <span>{emoji}</span>
      <span className="text-discord-text-muted text-[10px]">{count}</span>
    </button>
  );
};
