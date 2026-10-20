'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Profile } from '@/types';
import { downloadCsv, formatCurrency, formatMonth, lagosCurrentMonth, toCsv } from '@/lib/utils';
import { ROLE_LABELS, useMonthlyHours } from '@/lib/payroll';
import { Avatar } from '@/components/ui/Avatar';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { AlertCircle, Banknote, Download, Search, Users, Clock } from 'lucide-react';

export function AccountantDashboard({ profile }: { profile: Profile }) {
  const [month, setMonth] = useState(lagosCurrentMonth);
  const [search, setSearch] = useState('');
  const { rows, loading, error } = useMonthlyHours(month);

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

  const totalPay = filtered.reduce((s, r) => s + r.total_pay, 0);
  const totalHours = filtered.reduce((s, r) => s + r.total_hours, 0);
  const staffWithHours = filtered.filter(r => r.total_hours > 0).length;

  // Exports exactly what is on screen: the selected month and current search.
  const exportCSV = () => {
    const header = ['Month', 'Name', 'Email', 'Role', 'Department', 'Current Hourly Rate (NGN)', 'Total Hours', 'Timer Hours', 'Manual Hours', 'Days Worked', 'Pay (NGN)'];
    const data = filtered.map(r => [
      month, r.full_name || '', r.email, ROLE_LABELS[r.role], r.department || '',
      r.current_rate, r.total_hours, r.timer_hours, r.manual_hours, r.days_worked, r.total_pay,
    ]);
    const totals = ['', 'TOTAL', '', '', '', '', Number(totalHours.toFixed(2)), '', '', '', Number(totalPay.toFixed(2))];
    downloadCsv(`payroll-${month}.csv`, toCsv([header, ...data, totals]));
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <h1 className="page-title">
          Welcome, {profile.full_name?.split(' ')[0] || 'Accountant'} 👋
        </h1>
        <p className="page-subtitle">Monthly payroll for all staff · {formatMonth(month)}</p>
      </motion.div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: `Payroll · ${formatMonth(month)}`, value: loading ? '—' : formatCurrency(totalPay), icon: Banknote, color: 'emerald' },
          { label: 'Hours Logged', value: loading ? '—' : `${totalHours.toFixed(2)}h`, icon: Clock, color: 'sky' },
          { label: 'Staff With Hours', value: loading ? '—' : `${staffWithHours} of ${filtered.length}`, icon: Users, color: 'violet' },
        ].map(card => (
          <div key={card.label} className={`stat-card ${card.color}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: `rgba(${card.color === 'emerald' ? '16,217,138' : card.color === 'sky' ? '56,189,248' : '124,91,246'}, 0.15)` }}>
                <card.icon size={18} style={{
                  color: card.color === 'emerald' ? 'var(--accent-emerald)' : card.color === 'sky' ? 'var(--accent-sky)' : 'var(--accent-violet)'
                }} />
              </div>
            </div>
            <p className="text-2xl font-bold mb-1">{card.value}</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* Payroll Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card-flush">
        <div className="card-header">
          <h2 className="card-title">Payroll Summary</h2>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <div className="relative w-full sm:w-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, role, department..."
                aria-label="Search staff"
                className="input-field w-full pl-9 py-2 text-sm sm:w-[220px]"
              />
            </div>
            <button onClick={exportCSV} disabled={loading || filtered.length === 0} className="btn-secondary w-full py-2 sm:w-auto disabled:opacity-50">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Role</th>
                <th>Current Rate</th>
                <th>Hours</th>
                <th>Days Worked</th>
                <th>Pay</th>
                <th>Pay %</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                      <td key={j}><div className="skeleton h-4 rounded" /></td>
                    ))}</tr>
                  ))
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        {search ? 'No staff match your search.' : `No staff or hours for ${formatMonth(month)}.`}
                      </td>
                    </tr>
                  )
                  : filtered.map((row) => {
                    const pct = totalPay > 0 ? (row.total_pay / totalPay) * 100 : 0;
                    return (
                      <tr key={row.user_id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <Avatar src={row.avatar_url} name={row.full_name} size={32} />
                            <div>
                              <p className="font-medium text-sm">{row.full_name || 'Unnamed'}</p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.department || row.email}</p>
                            </div>
                          </div>
                        </td>
                        <td><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{ROLE_LABELS[row.role]}</span></td>
                        <td><span className="text-sm font-medium">{formatCurrency(row.current_rate)}</span></td>
                        <td>
                          <span className="text-sm font-semibold" style={{ color: 'var(--accent-sky)' }}>
                            {row.total_hours.toFixed(2)}h
                          </span>
                          {row.manual_hours !== 0 && (
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }} title="Hours typed in by hand, or carried over from before time tracking">
                              {row.manual_hours.toFixed(2)}h manual
                            </p>
                          )}
                        </td>
                        <td><span className="text-sm">{row.days_worked}</span></td>
                        <td>
                          <span className="text-base font-bold" style={{ color: 'var(--accent-emerald)' }}>
                            {formatCurrency(row.total_pay)}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-hover)', minWidth: '60px' }}>
                              <div className="h-full rounded-full" style={{
                                width: `${pct}%`,
                                background: 'linear-gradient(90deg, #10d98a, #38bdf8)'
                              }} />
                            </div>
                            <span className="text-xs w-10 text-right" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-bright)', background: 'var(--bg-hover)' }}>
                  <td colSpan={3} className="py-3 px-4 font-semibold">Totals</td>
                  <td className="py-3 px-4 font-bold" style={{ color: 'var(--accent-sky)' }}>{totalHours.toFixed(2)}h</td>
                  <td />
                  <td className="py-3 px-4 font-bold text-base" style={{ color: 'var(--accent-emerald)' }}>{formatCurrency(totalPay)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Pay uses each person&apos;s hourly rate at the time the hours were logged, so it can differ from hours × current rate if a rate changed during the month.
        </p>
      </motion.div>
    </div>
  );
}
