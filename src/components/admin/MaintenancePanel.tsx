'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DatabaseBackup, Loader2, Play, CalendarClock } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Status {
  schedules: { id: string; cron: string; paused: boolean }[];
  lastBackup: { key: string; at: string | null; count: number } | null;
}

/** Settings card: nightly backup schedule status, and run-now / set-up buttons. */
export function MaintenancePanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<'schedule' | 'run' | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/maintenance', { cache: 'no-store' });
      const result = await response.json();
      if (response.ok) setStatus(result); else setMessage(result.error || 'Could not load backup status.');
    } catch {
      setMessage('Could not load backup status.');
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(first);
  }, [load]);

  const act = async (action: 'ensure-schedule' | 'run-now') => {
    setBusy(action === 'run-now' ? 'run' : 'schedule');
    setMessage('');
    try {
      const response = await fetch('/api/admin/maintenance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setMessage(result.error || 'Something went wrong.');
      else setMessage(action === 'run-now' ? 'Backup started. It usually finishes within a minute — refresh to see it.' : 'Nightly schedule is set up.');
      await load();
    } catch {
      setMessage('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const scheduled = (status?.schedules.length ?? 0) > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,217,138,0.15)' }}>
          <DatabaseBackup size={18} style={{ color: 'var(--accent-emerald)' }} />
        </div>
        <h2 className="card-title">Backups &amp; Maintenance</h2>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
          <span className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}><CalendarClock size={14} /> Nightly job (3:00 AM Eastern)</span>
          <span className="text-sm font-medium">{status ? (scheduled ? 'Scheduled' : 'Not scheduled') : '—'}</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Latest backup</span>
          <span className="text-sm font-medium">
            {status?.lastBackup?.at ? `${formatDateTime(status.lastBackup.at)} (${status.lastBackup.count} kept)` : status ? 'None yet' : '—'}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Each night the app backs up all staff, task, hours, payroll and chat records to private storage (30 days kept) and removes unfinished uploads.
        </p>
        {message && <p role="status" className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>}
        <div className="flex flex-wrap gap-3">
          {status && !scheduled && (
            <button onClick={() => void act('ensure-schedule')} disabled={busy !== null} className="btn-primary">
              {busy === 'schedule' ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />} Set up nightly schedule
            </button>
          )}
          <button onClick={() => void act('run-now')} disabled={busy !== null} className="btn-secondary">
            {busy === 'run' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run backup now
          </button>
        </div>
      </div>
    </motion.div>
  );
}
