import React from 'react';

interface Props {
  username: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

function hashColor(name: string) {
  let h = 0; for (let i=0;i<name.length;i++) h = (h*31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360; return `hsl(${hue} 65% 40%)`;
}

export const UserAvatar: React.FC<Props> = ({ username, avatarUrl, size = 32, className = '' }) => {
  const style: React.CSSProperties = { width: size, height: size };
  let resolved = avatarUrl || '';
  if (resolved && resolved.startsWith('/')) {
    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
    resolved = base + resolved;
  }
  if (resolved) {
    return <img src={resolved} alt={username} width={size} height={size} className={`rounded-full object-cover ${className}`} style={style} />;
  }
  const bg = hashColor(username);
  return (
    <div className={`rounded-full flex items-center justify-center text-white text-xs font-semibold ${className}`} style={{ ...style, background: bg }}>
      {username.slice(0,2).toUpperCase()}
    </div>
  );
};

export default UserAvatar;