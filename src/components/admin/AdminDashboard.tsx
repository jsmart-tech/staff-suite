'use client';

import { motion } from 'framer-motion';
import { Profile } from '@/types';
import { getInitials, getRoleBadgeColor, formatCurrency } from '@/lib/utils';
import {
  Users, CheckSquare, Clock, TrendingUp, Activity,
  ArrowUpRight, ArrowDownRight, Shield,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Stats {
  totalStaff: number;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  totalHoursToday: number;
  recentLogins: number;
}

export function AdminDashboard({ profile }: { profile: Profile }) {
  const [stats, setStats] = useState<Stats>({
    totalStaff: 0, totalTasks: 0, activeTasks: 0,
    completedTasks: 0, totalHoursToday: 0, recentLogins: 0,
  });
  const [recentStaff, setRecentStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      const [staffRes, tasksRes, todayTasksRes, loginRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('status, hours_spent'),
        supabase.from('tasks').select('hours_spent').eq('date_worked', new Date().toISOString().split('T')[0]),
        supabase.from('login_logs').select('id').gte('login_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const staff = staffRes.data || [];
      const tasks = tasksRes.data || [];
      const todayTasks = todayTasksRes.data || [];

      setStats({
        totalStaff: staff.length,
        totalTasks: tasks.length,
        activeTasks: tasks.filter(t => t.status === 'in_progress').length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
        totalHoursToday: todayTasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0),
        recentLogins: loginRes.data?.length || 0,
      });
      setRecentStaff(staff.slice(0, 5) as Profile[]);
      setLoading(false);
    };
    fetchData();
  }, []);

  const statCards = [
    { label: 'Total Staff', value: stats.totalStaff, icon: Users, color: 'violet', change: '+2 this month', up: true },
    { label: 'Active Tasks', value: stats.activeTasks, icon: Activity, color: 'amber', change: `${stats.totalTasks} total`, up: true },
    { label: 'Completed Tasks', value: stats.completedTasks, icon: CheckSquare, color: 'emerald', change: 'All time', up: true },
    { label: 'Hours Today', value: `${stats.totalHoursToday.toFixed(1)}h`, icon: Clock, color: 'sky', change: 'Team total', up: true },
    { label: 'Logins (24h)', value: stats.recentLogins, icon: Shield, color: 'rose', change: 'Active sessions', up: false },
  ];

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #7c5bf6, #5b3fd4)', color: 'white' }}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} className="h-full w-full object-cover" /> : getInitials(profile.full_name)}
          </div>
          <div>
            <h1 className="page-title">
              Welcome back, {profile.full_name?.split(' ')[0] || 'Admin'} 👋
            </h1>
            <p className="page-subtitle">Here&apos;s your workspace overview for today</p>
          </div>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8"
        style={{ marginBottom: 'var(--section-gap)' }}
      >
        {statCards.map((card) => (
          <motion.div key={card.label} variants={item} className={`stat-card ${card.color}`}>
            {loading ? (
              <div className="skeleton h-20 w-full rounded-xl" />
            ) : (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: `rgba(var(--${card.color === 'violet' ? '124,91,246' : card.color === 'amber' ? '245,158,11' : card.color === 'emerald' ? '16,217,138' : card.color === 'sky' ? '56,189,248' : '244,63,94'}), 0.15)` }}>
                    <card.icon size={18} style={{
                      color: card.color === 'violet' ? 'var(--accent-violet)' :
                        card.color === 'amber' ? 'var(--accent-amber)' :
                        card.color === 'emerald' ? 'var(--accent-emerald)' :
                        card.color === 'sky' ? 'var(--accent-sky)' : 'var(--accent-rose)'
                    }} />
                  </div>
                  {card.up
                    ? <ArrowUpRight size={16} style={{ color: 'var(--accent-emerald)' }} />
                    : <ArrowDownRight size={16} style={{ color: 'var(--accent-rose)' }} />
                  }
                </div>
                <p className="text-2xl font-bold mb-1">{card.value}</p>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{card.label}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{card.change}</p>
              </>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* Content Grid */}
      <div className="grid lg:grid-cols-2 gap-6" style={{ gap: 'var(--space-6)' }}>
        {/* Recent Staff */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card"
          style={{ gap: 'var(--card-pad)' }}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="card-title">Recent Staff</h2>
            <a href="/dashboard/admin/staff" className="text-xs font-medium hover:underline"
              style={{ color: 'var(--accent-violet)' }}>
              View all →
            </a>
          </div>
          <div className="space-y-3">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton w-9 h-9 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-3 w-32" />
                      <div className="skeleton h-2 w-20" />
                    </div>
                  </div>
                ))
              : recentStaff.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--bg-hover)] transition-colors">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #7c5bf6, #38bdf8)', color: 'white' }}>
                      {s.avatar_url ? <img src={s.avatar_url} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} className="h-full w-full object-cover" /> : getInitials(s.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.full_name || 'Unnamed'}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{s.email}</p>
                    </div>
                    <span className={`badge text-[11px] ${getRoleBadgeColor(s.role)}`}>
                      {s.role}
                    </span>
                  </div>
                ))
            }
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card"
        >
          <h2 className="card-title mb-5">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Manage Staff', href: '/dashboard/admin/staff', icon: Users, color: '#7c5bf6' },
              { label: 'View All Tasks', href: '/dashboard/admin/tasks', icon: CheckSquare, color: '#10d98a' },
              { label: 'Audit Logs', href: '/dashboard/admin/logs', icon: Shield, color: '#f59e0b' },
              { label: 'Team Chat', href: '/dashboard/chat', icon: TrendingUp, color: '#38bdf8' },
            ].map((action) => (
              <a
                key={action.label}
                href={action.href}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl text-center transition-all hover:scale-105"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${action.color}20` }}>
                  <action.icon size={20} style={{ color: action.color }} />
                </div>
                <span className="text-sm font-medium">{action.label}</span>
              </a>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
