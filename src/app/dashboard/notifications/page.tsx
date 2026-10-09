'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { AppNotification } from '@/types';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
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

  const sendReply = async (notification: AppNotification) => {
    if (!notification.entity_id || !reply.trim()) return;
    const response = await fetch(`/api/tasks/${notification.entity_id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply }) });
    if (response.ok) { setReply(''); setReplyFor(null); await load(); }
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
          <div key={notification.id} className={`border-b border-[var(--border)] p-5 last:border-0 ${notification.read_at ? 'opacity-65' : ''}`}>
            <Link href={notification.href} onClick={() => { if (!notification.read_at) void markRead([notification.id]); }}>
            <div className="flex items-start justify-between gap-4"><p className="font-semibold">{notification.title}</p>{!notification.read_at && <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent-rose)]" />}</div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{notification.body}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{new Date(notification.created_at).toLocaleString()}</p>
            </Link>
            {notification.type === 'task_comment' && notification.entity_id && <div className="mt-4"><button type="button" onClick={() => setReplyFor(replyFor === notification.id ? null : notification.id)} className="text-sm font-semibold text-[var(--accent-violet)]">Reply to comment</button>{replyFor === notification.id && <div className="mt-2 flex gap-2"><textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Write a reply..." className="input-field min-h-16 flex-1" /><button type="button" onClick={() => void sendReply(notification)} className="btn-primary self-end">Send</button></div>}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
