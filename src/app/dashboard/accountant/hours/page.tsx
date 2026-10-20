'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { daysInMonth, downloadCsv, formatCurrency, formatDateOnly, formatMonth, lagosCurrentMonth, lagosToday, toCsv } from '@/lib/utils';
import { ROLE_LABELS, useMonthlyHours } from '@/lib/payroll';
import { Avatar } from '@/components/ui/Avatar';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { AlertCircle, Download, Search } from 'lucide-react';

export default function AccountantHoursPage() {
  const [month, setMonth] = useState(lagosCurrentMonth);
  const [search, setSearch] = useState('');
  const { rows, days, loading, error } = useMonthlyHours(month, { byDay: true });
  const monthDays = useMemo(() => daysInMonth(month), [month]);
  const today = lagosToday();

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.full_name?.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.department?.toLowerCase().includes(q) ||
      ROLE_LABELS[r.role].toLowerCase().includes(q)
    );
  }, [search, rows]);

  const dayTotal = (date: string) => filtered.reduce((s, r) => s + (days[r.user_id]?.[date] || 0), 0);
  const totalHours = filtered.reduce((s, r) => s + r.total_hours, 0);
  const totalPay = filtered.reduce((s, r) => s + r.total_pay, 0);

  // Same month and search as the table on screen.
  const exportCSV = () => {
    const header = ['Name', 'Email', 'Role', 'Department', ...monthDays, 'Total Hours', 'Pay (NGN)'];
    const data = filtered.map(r => [
      r.full_name || '', r.email, ROLE_LABELS[r.role], r.department || '',
      ...monthDays.map(d => days[r.user_id]?.[d] || 0),
      r.total_hours, r.total_pay,
    ]);
    const totals = ['TOTAL', '', '', '', ...monthDays.map(d => Number(dayTotal(d).toFixed(2))), Number(totalHours.toFixed(2)), Number(totalPay.toFixed(2))];
    downloadCsv(`hours-${month}.csv`, toCsv([header, ...data, totals]));
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <h1 className="page-title">Hours Report</h1>
        <p className="page-subtitle">Daily hours for every staff member · {formatMonth(month)}</p>
      </motion.div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <MonthPicker month={month} onChange={setMonth} />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter staff..."
            aria-label="Filter staff"
            className="input-field pl-9 py-2 text-sm"
            style={{ width: '200px' }}
          />
        </div>
        <button onClick={exportCSV} disabled={loading || filtered.length === 0} className="btn-secondary py-2 ml-auto disabled:opacity-50">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Hours Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card p-0 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="data-table" style={{ minWidth: `${360 + monthDays.length * 56}px` }}>
            <thead>
              <tr>
                <th className="sticky left-0" style={{ background: 'var(--bg-secondary)', zIndex: 1 }}>Staff Member</th>
                <th className="text-right">Total Hours</th>
                <th className="text-right">Pay</th>
                {monthDays.map(d => (
                  <th key={d} className="text-center" style={d === today ? { color: 'var(--accent-violet)' } : undefined}>
                    <div>{formatDateOnly(d, { weekday: 'short' })}</div>
                    <div className="font-normal text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {formatDateOnly(d, { day: 'numeric' })}
                    </div>
                  </th>
                ))}
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
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={3 + monthDays.length} className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        {search ? 'No staff match your filter.' : `No staff or hours for ${formatMonth(month)}.`}
                      </td>
                    </tr>
                  )
                  : filtered.map(row => (
                    <tr key={row.user_id}>
                      <td className="sticky left-0" style={{ background: 'var(--bg-card)', zIndex: 1 }}>
                        <div className="flex items-center gap-2">
                          <Avatar src={row.avatar_url} name={row.full_name} size={28} />
                          <div>
                            <p className="font-medium text-sm">{row.full_name || 'Unnamed'}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{ROLE_LABELS[row.role]}{row.department ? ` · ${row.department}` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-right">
                        <span className="font-bold text-sm" style={{ color: 'var(--accent-sky)' }}>{row.total_hours.toFixed(2)}h</span>
                      </td>
                      <td className="text-right">
                        <span className="font-bold" style={{ color: 'var(--accent-emerald)' }}>{formatCurrency(row.total_pay)}</span>
                      </td>
                      {monthDays.map(d => {
                        const h = days[row.user_id]?.[d] || 0;
                        return (
                          <td key={d} className="text-center">
                            {h !== 0 ? (
                              <span className="font-semibold text-sm" style={{ color: 'var(--accent-sky)' }}>{h.toFixed(2)}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
              }
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-bright)', background: 'var(--bg-hover)' }}>
                  <td className="py-3 px-4 font-semibold sticky left-0" style={{ background: 'var(--bg-hover)' }}>Team Totals</td>
                  <td className="text-right py-3 px-4 font-bold" style={{ color: 'var(--accent-sky)' }}>{totalHours.toFixed(2)}h</td>
                  <td className="text-right py-3 px-4 font-bold" style={{ color: 'var(--accent-emerald)' }}>{formatCurrency(totalPay)}</td>
                  {monthDays.map(d => {
                    const total = dayTotal(d);
                    return (
                      <td key={d} className="text-center py-3">
                        {total !== 0
                          ? <span className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>{total.toFixed(1)}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </motion.div>
    </div>
  );
}
