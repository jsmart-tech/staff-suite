'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { AppNotification } from '@/types';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const unread = notifications.filter(notification => !notification.read_at);

  const load = useCallback(async () => {
    const response = await fetch('/api/notifications');
    if (response.ok) {
      const result = await response.json();
      setNotifications(result.notifications || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markRead = async (ids?: string[]) => {
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids ? { ids } : { all: true }),
    });
    if (response.ok) await load();
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Stay up to date with tasks, messages, and account activity.</p>
        </div>
        {unread.length > 0 && (
          <button type="button" onClick={() => void markRead()} className="btn-secondary flex items-center gap-2">
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        {loading ? <div className="flex items-center justify-center p-12"><Loader2 className="animate-spin" /></div> : notifications.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)]"><Bell className="mx-auto mb-3" size={28} /><p>You&apos;re all caught up.</p></div>
        ) : notifications.map(notification => (
          <Link key={notification.id} href={notification.href} onClick={() => { if (!notification.read_at) void markRead([notification.id]); }} className={`block border-b border-[var(--border)] p-5 last:border-0 hover:bg-[var(--bg-hover)] ${notification.read_at ? 'opacity-65' : ''}`}>
            <div className="flex items-start justify-between gap-4"><p className="font-semibold">{notification.title}</p>{!notification.read_at && <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent-rose)]" />}</div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{notification.body}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{new Date(notification.created_at).toLocaleString()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
