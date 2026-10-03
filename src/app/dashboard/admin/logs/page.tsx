'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { LoginLog, Profile } from '@/types';
import { getRoleBadgeColor, getInitials } from '@/lib/utils';
import { Shield, Clock, Search, RefreshCw } from 'lucide-react';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<(LoginLog & { profiles: Pick<Profile, 'full_name' | 'email' | 'role'> })[]>([]);
  const [filtered, setFiltered] = useState<typeof logs>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const supabase = createClient();

  const fetchLogs = async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from('login_logs')
      .select('*, profiles(full_name, email, role)')
      .order('login_time', { ascending: false })
      .limit(200);
    setLogs(data as typeof logs || []);
    setFiltered(data as typeof logs || []);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  useEffect(() => {
    if (!search) { setFiltered(logs); return; }
    const q = search.toLowerCase();
    setFiltered(logs.filter(l =>
      l.profiles?.full_name?.toLowerCase().includes(q) ||
      l.profiles?.email?.toLowerCase().includes(q) ||
      l.profiles?.role?.includes(q) ||
      l.ip_address?.includes(q)
    ));
  }, [search, logs]);

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <div className="flex items-center gap-3">
          <Shield size={22} style={{ color: 'var(--accent-violet)' }} />
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Audit Logs
          </h1>
        </div>
        <p className="page-subtitle" style={{ marginTop: 'var(--space-2)' }}>Track all staff login activity and access events</p>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Logins', value: logs.length, color: 'violet' },
          { label: 'Today', value: logs.filter(l => new Date(l.login_time).toDateString() === new Date().toDateString()).length, color: 'emerald' },
          { label: 'This Week', value: logs.filter(l => new Date(l.login_time) > new Date(Date.now() - 7 * 86400000)).length, color: 'sky' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <p className="text-2xl font-bold mb-1">{loading ? '—' : s.value}</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + Refresh */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, role, IP..."
            className="input-field pl-9"
          />
        </div>
        <button onClick={fetchLogs} className="btn-secondary px-4" disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Log Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card p-0 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Staff Member</th>
                <th>Role</th>
                <th>Login Time</th>
                <th>IP Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                      <td key={j}><div className="skeleton h-4 rounded" /></td>
                    ))}</tr>
                  ))
                : filtered.map((log, idx) => (
                    <tr key={log.id}>
                      <td>
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {String(idx + 1).padStart(3, '0')}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                            style={{ background: 'linear-gradient(135deg, #7c5bf6, #38bdf8)', color: 'white' }}>
                            {getInitials(log.profiles?.full_name)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{log.profiles?.full_name || 'Unknown'}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{log.profiles?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${getRoleBadgeColor(log.profiles?.role || 'employee')}`}>
                          {log.profiles?.role || '—'}
                        </span>
                      </td>
                      <td>
                        <div>
                          <p className="text-sm">
                            {new Date(log.login_time).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {new Date(log.login_time).toLocaleTimeString('en-GB', {
                              hour: '2-digit', minute: '2-digit', second: '2-digit'
                            })}
                          </p>
                        </div>
                      </td>
                      <td>
                        <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {log.ip_address || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{
                          background: 'rgba(16,217,138,0.1)',
                          color: '#10d98a',
                          border: '1px solid rgba(16,217,138,0.3)'
                        }}>
                          ✓ Success
                        </span>
                      </td>
                    </tr>
                  ))
              }
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                    <Clock size={32} className="mx-auto mb-2 opacity-30" />
                    <p>No login records found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
