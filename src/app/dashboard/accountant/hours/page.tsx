'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Profile, Task } from '@/types';
import { formatCurrency, getInitials } from '@/lib/utils';
import { Download, Search, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface HoursRow {
  profile: Profile;
  tasks: Task[];
  totalHours: number;
  byDate: Record<string, number>;
}

export default function AccountantHoursPage() {
  const [rows, setRows] = useState<HoursRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const supabase = createClient();

  const getWeekDays = (offset: number) => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  };

  const weekDays = getWeekDays(weekOffset);

  useEffect(() => {
    const fetch = async () => {
      const { data: profiles } = await supabase.from('profiles').select('*').eq('role', 'employee');
      const { data: tasks } = await supabase.from('tasks').select('*');
      const result: HoursRow[] = (profiles || []).map((p: Profile) => {
        const userTasks = (tasks || []).filter((t: Task) => t.user_id === p.id);
        const totalHours = userTasks.reduce((s: number, t: Task) => s + t.hours_spent, 0);
        const byDate: Record<string, number> = {};
        userTasks.forEach((t: Task) => {
          byDate[t.date_worked] = (byDate[t.date_worked] || 0) + t.hours_spent;
        });
        return { profile: p as Profile, tasks: userTasks as Task[], totalHours, byDate };
      });
      setRows(result);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.profile.full_name?.toLowerCase().includes(q) ||
      r.profile.email.toLowerCase().includes(q) ||
      r.profile.department?.toLowerCase().includes(q)
    );
  }, [search, rows]);

  const weekLabel = weekOffset === 0 ? 'This Week'
    : weekOffset === -1 ? 'Last Week'
    : weekDays[0].substring(0, 10);

  const exportCSV = () => {
    const header = ['Employee', 'Email', ...weekDays.map(d => new Date(d).toLocaleDateString('en-GB')), 'Total Hours', 'Total Pay'];
    const data = rows.map(r => [
      r.profile.full_name || '', r.profile.email,
      ...weekDays.map(d => (r.byDate[d] || 0).toFixed(2)),
      r.totalHours.toFixed(2),
      (r.totalHours * r.profile.hourly_rate).toFixed(2)
    ]);
    const csv = [header, ...data].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `hours-${weekDays[0]}.csv`
    });
    a.click();
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <h1 className="page-title">Hours Report</h1>
        <p className="page-subtitle">Weekly work hours breakdown by employee</p>
      </motion.div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded-lg hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}>
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2 px-2">
            <Calendar size={14} style={{ color: 'var(--accent-violet)' }} />
            <span className="text-sm font-medium">{weekLabel}</span>
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0}
            className="p-1 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30"
            style={{ color: 'var(--text-secondary)' }}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter employees..."
            className="input-field pl-9 py-2 text-sm"
            style={{ width: '200px' }}
          />
        </div>
        <button onClick={exportCSV} className="btn-secondary py-2 ml-auto">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Hours Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card p-0 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="data-table" style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th className="sticky left-0" style={{ background: 'var(--bg-secondary)', zIndex: 1 }}>Employee</th>
                {weekDays.map(d => (
                  <th key={d} className="text-center">
                    <div>{new Date(d).toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                    <div className="font-normal text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </th>
                ))}
                <th className="text-right">Total Hours</th>
                <th className="text-right">Pay</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j}><div className="skeleton h-4 rounded" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.map(row => {
                    const weekHours = weekDays.reduce((s, d) => s + (row.byDate[d] || 0), 0);
                    const weekPay = weekHours * row.profile.hourly_rate;
                    return (
                      <tr key={row.profile.id}>
                        <td className="sticky left-0" style={{ background: 'var(--bg-card)', zIndex: 1 }}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden text-[10px] font-bold"
                              style={{ background: 'linear-gradient(135deg, #10d98a, #38bdf8)', color: 'white' }}>
                              {row.profile.avatar_url ? <img src={row.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : getInitials(row.profile.full_name)}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{row.profile.full_name || 'Unnamed'}</p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.profile.department || row.profile.email}</p>
                            </div>
                          </div>
                        </td>
                        {weekDays.map(d => {
                          const h = row.byDate[d] || 0;
                          const isToday = d === new Date().toISOString().split('T')[0];
                          return (
                            <td key={d} className="text-center">
                              {h > 0 ? (
                                <span className="font-semibold text-sm" style={{ color: 'var(--accent-sky)' }}>
                                  {h.toFixed(2)}h
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                              {isToday && <div className="w-1.5 h-1.5 rounded-full mx-auto mt-1"
                                style={{ background: 'var(--accent-violet)' }} />}
                            </td>
                          );
                        })}
                        <td className="text-right">
                          <span className="font-bold text-sm" style={{ color: 'var(--accent-sky)' }}>
                            {weekHours.toFixed(2)}h
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="font-bold" style={{ color: 'var(--accent-emerald)' }}>
                            {formatCurrency(weekPay)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
            {!loading && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-bright)', background: 'var(--bg-hover)' }}>
                  <td className="py-3 px-4 font-semibold sticky left-0" style={{ background: 'var(--bg-hover)' }}>Team Totals</td>
                  {weekDays.map(d => {
                    const dayTotal = filtered.reduce((s, r) => s + (r.byDate[d] || 0), 0);
                    return (
                      <td key={d} className="text-center py-3">
                        {dayTotal > 0 ? (
                          <span className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {dayTotal.toFixed(1)}h
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    );
                  })}
                  <td className="text-right py-3 px-4 font-bold" style={{ color: 'var(--accent-sky)' }}>
                    {filtered.reduce((s, r) => s + weekDays.reduce((ws, d) => ws + (r.byDate[d] || 0), 0), 0).toFixed(2)}h
                  </td>
                  <td className="text-right py-3 px-4 font-bold" style={{ color: 'var(--accent-emerald)' }}>
                    {formatCurrency(filtered.reduce((s, r) => {
                      const wh = weekDays.reduce((ws, d) => ws + (r.byDate[d] || 0), 0);
                      return s + wh * r.profile.hourly_rate;
                    }, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </motion.div>
    </div>
  );
}
