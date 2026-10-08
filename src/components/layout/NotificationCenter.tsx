'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AppNotification } from '@/types';

export function NotificationCenter({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const centerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const unread = notifications.filter(notification => !notification.read_at);

  const load = async () => {
    const response = await fetch('/api/notifications');
    if (!response.ok) return;
    const result = await response.json();
    setNotifications(result.notifications || []);
  };

  useEffect(() => {
    void Promise.resolve().then(load);
    const channel = supabase.channel(`notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => {
        void load();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (centerRef.current && !centerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('touchstart', closeOnOutsideClick);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('touchstart', closeOnOutsideClick);
    };
  }, [open]);

  const markRead = async (ids?: string[]) => {
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids ? { ids } : { all: true }),
    });
    if (response.ok) await load();
  };

  return (
    <div ref={centerRef} className="relative">
      <button type="button" onClick={() => setOpen(current => !current)} aria-label="Notifications" className="relative rounded-xl p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white">
        <Bell size={18} />
        {unread.length > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--accent-rose)] px-1 text-[10px] font-bold text-white">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-[80] w-[min(360px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div><p className="text-sm font-semibold">Notifications</p><p className="text-xs text-[var(--text-muted)]">{unread.length} unread</p></div>
            {unread.length > 0 && <button type="button" onClick={() => void markRead()} className="flex items-center gap-1 text-xs font-semibold text-[var(--accent-violet)]"><CheckCheck size={14} /> Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? <p className="p-5 text-center text-sm text-[var(--text-muted)]">You&apos;re all caught up.</p> : notifications.map(notification => (
              <Link key={notification.id} href={notification.href} onClick={() => { void markRead([notification.id]); setOpen(false); }} className={`block border-b border-[var(--border)] px-4 py-3 last:border-0 hover:bg-[var(--bg-hover)] ${notification.read_at ? 'opacity-65' : ''}`}>
                <p className="text-sm font-semibold">{notification.title}</p>
                <p className="mt-1 break-words text-xs text-[var(--text-secondary)]">{notification.body}</p>
                <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{new Date(notification.created_at).toLocaleString()}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
