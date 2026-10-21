'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils';

interface AppError {
  id: string;
  created_at: string;
  source: 'browser' | 'server';
  message: string;
  stack: string | null;
  url: string | null;
  profiles: { full_name: string | null; email: string } | null;
}

/** Most recent browser and server errors (admins only, via RLS). */
export function SystemErrors() {
  const supabase = useMemo(() => createClient(), []);
  const [errors, setErrors] = useState<AppError[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('app_errors')
      .select('id, created_at, source, message, stack, url, profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(50);
    setErrors((data as unknown as AppError[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(first);
  }, [load]);

  return (
    <section className="card-flush mt-6" aria-labelledby="system-errors-title">
      <div className="card-header">
        <h2 id="system-errors-title" className="card-title flex items-center gap-2">
          <AlertTriangle size={16} style={{ color: 'var(--accent-amber)' }} /> System errors
        </h2>
        <button onClick={() => void load()} className="btn-secondary py-2" aria-label="Refresh system errors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      <p className="px-4 pb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Errors from staff browsers and the server, newest first. Admins get an email when one happens (at most one per hour). Kept for 90 days.
      </p>
      {!loading && errors.length === 0 ? (
        <p className="flex items-center gap-2 px-4 pb-6 text-sm" style={{ color: 'var(--accent-emerald)' }}>
          <CheckCircle size={16} /> No errors recorded.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {errors.map(e => (
            <li key={e.id} className="px-4 py-3 text-sm">
              <button
                className="flex w-full items-start gap-3 text-left"
                onClick={() => setOpen(open === e.id ? null : e.id)}
                aria-expanded={open === e.id}
              >
                <span className="badge shrink-0 text-[10px]" style={{ background: 'var(--bg-hover)' }}>{e.source}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.message}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatDateTime(e.created_at)} · {e.url || 'unknown page'}{e.profiles ? ` · ${e.profiles.full_name || e.profiles.email}` : ''}
                  </span>
                </span>
              </button>
              {open === e.id && e.stack && (
                <pre className="mt-2 max-h-60 overflow-auto rounded-lg p-3 text-[11px]" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{e.stack}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
