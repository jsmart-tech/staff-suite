'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';
import { formatCurrency, getInitials } from '@/lib/utils';
import { DollarSign, Download, Search, TrendingUp, Users, Clock } from 'lucide-react';

interface PayrollRow {
  user_id: string;
  full_name: string | null;
  email: string;
  department: string | null;
  role: string;
  hourly_rate: number;
  total_hours: number;
  total_pay: number;
}

export function AccountantDashboard({ profile }: { profile: Profile }) {
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [totalPay, setTotalPay] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      const { data: profiles } = await supabase.from('profiles').select('*').eq('role', 'employee');
      const { data: tasks } = await supabase.from('tasks').select('user_id, hours_spent');

      const rows: PayrollRow[] = (profiles || []).map((p: Profile) => {
        const userTasks = (tasks || []).filter(t => t.user_id === p.id);
        const total_hours = userTasks.reduce((s, t) => s + (t.hours_spent || 0), 0);
        const total_pay = total_hours * p.hourly_rate;
        return {
          user_id: p.id,
          full_name: p.full_name,
          email: p.email,
          department: p.department,
          role: p.role,
          hourly_rate: p.hourly_rate,
          total_hours,
          total_pay,
        };
      });

      rows.sort((a, b) => b.total_pay - a.total_pay);
      setPayroll(rows);
      setTotalPay(rows.reduce((s, r) => s + r.total_pay, 0));
      setTotalHours(rows.reduce((s, r) => s + r.total_hours, 0));
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return payroll;
    const q = search.toLowerCase();
    return payroll.filter(r =>
      r.full_name?.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.department?.toLowerCase().includes(q)
    );
  }, [search, payroll]);

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Department', 'Hourly Rate', 'Total Hours', 'Total Pay'];
    const rows = payroll.map(r => [
      r.full_name || '', r.email, r.department || '',
      r.hourly_rate, r.total_hours.toFixed(2), r.total_pay.toFixed(2)
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `payroll-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <h1 className="page-title">
          Welcome, {profile.full_name?.split(' ')[0] || 'Accountant'} 👋
        </h1>
        <p className="page-subtitle">Financial overview and payroll management</p>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Payroll', value: loading ? '—' : formatCurrency(totalPay), icon: DollarSign, color: 'emerald' },
          { label: 'Total Hours Logged', value: loading ? '—' : `${totalHours.toFixed(1)}h`, icon: Clock, color: 'sky' },
          { label: 'Active Employees', value: loading ? '—' : payroll.length, icon: Users, color: 'violet' },
        ].map(card => (
          <div key={card.label} className={`stat-card ${card.color}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: `rgba(${card.color === 'emerald' ? '16,217,138' : card.color === 'sky' ? '56,189,248' : '124,91,246'}, 0.15)` }}>
                <card.icon size={18} style={{
                  color: card.color === 'emerald' ? 'var(--accent-emerald)' : card.color === 'sky' ? 'var(--accent-sky)' : 'var(--accent-violet)'
                }} />
              </div>
              <TrendingUp size={14} style={{ color: 'var(--accent-emerald)', marginLeft: 'auto' }} />
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
                placeholder="Search..."
                className="input-field w-full pl-9 py-2 text-sm sm:w-[180px]"
              />
            </div>
            <button onClick={exportCSV} className="btn-secondary w-full py-2 sm:w-auto">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Hourly Rate</th>
                <th>Hours Logged</th>
                <th>Total Pay</th>
                <th>Pay %</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                      <td key={j}><div className="skeleton h-4 rounded" /></td>
                    ))}</tr>
                  ))
                : filtered.map((row) => {
                    const pct = totalPay > 0 ? (row.total_pay / totalPay) * 100 : 0;
                    return (
                      <tr key={row.user_id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ background: 'linear-gradient(135deg, #10d98a, #38bdf8)', color: 'white' }}>
                              {getInitials(row.full_name)}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{row.full_name || 'Unnamed'}</p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.email}</p>
                            </div>
                          </div>
                        </td>
                        <td><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.department || '—'}</span></td>
                        <td><span className="text-sm font-medium">{formatCurrency(row.hourly_rate)}</span></td>
                        <td>
                          <span className="text-sm font-semibold" style={{ color: 'var(--accent-sky)' }}>
                            {row.total_hours.toFixed(2)}h
                          </span>
                        </td>
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
            {!loading && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-bright)', background: 'var(--bg-hover)' }}>
                  <td colSpan={3} className="py-3 px-4 font-semibold">Totals</td>
                  <td className="py-3 px-4 font-bold" style={{ color: 'var(--accent-sky)' }}>{totalHours.toFixed(2)}h</td>
                  <td className="py-3 px-4 font-bold text-base" style={{ color: 'var(--accent-emerald)' }}>{formatCurrency(totalPay)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </motion.div>
    </div>
  );
}
