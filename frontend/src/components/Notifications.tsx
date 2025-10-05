import React, { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';

export const Notifications: React.FC = () => {
  const { notifications, remove } = useUIStore();

  useEffect(() => {
    const timers = notifications.map(n => {
      if (!n.ttl) return null;
      const remaining = n.ttl - (Date.now() - n.createdAt);
      if (remaining <= 0) { remove(n.id); return null; }
      return setTimeout(() => remove(n.id), remaining);
    });
    return () => { timers.forEach(t => t && clearTimeout(t as any)); };
  }, [notifications, remove]);

  if (notifications.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
      {notifications.map(n => (
        <div key={n.id} className={`rounded shadow px-4 py-3 text-sm border bg-white ${
          n.type === 'error' ? 'border-red-300 text-red-700' :
          n.type === 'success' ? 'border-green-300 text-green-700' :
          n.type === 'warning' ? 'border-yellow-300 text-yellow-700' : 'border-gray-300 text-gray-700'
        }`}> 
          <div className="flex justify-between items-start gap-3">
            <span>{n.message}</span>
            <button onClick={() => remove(n.id)} className="text-xs opacity-60 hover:opacity-100">×</button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Notifications;