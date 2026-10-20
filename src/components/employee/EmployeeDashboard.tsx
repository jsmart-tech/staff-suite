'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Profile, Task } from '@/types';
import { formatDateOnly, lagosToday } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import {
  CheckSquare, Clock, TrendingUp, Play,
  Plus, Target, Calendar, Zap,
} from 'lucide-react';

export function EmployeeDashboard({ profile }: { profile: Profile }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runningTask, setRunningTask] = useState<Task | null>(null);
  const [stats, setStats] = useState({ todayLogged: 0, monthLogged: 0, completed: 0, inProgress: 0 });
  const [loading, setLoading] = useState(true);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [liveTodaySeconds, setLiveTodaySeconds] = useState(0);
  // Memoized — never recreates the WebSocket connection on re-render
  const supabase = useMemo(() => createClient(), []);

  // Stats come from the time log and exact counts, not from the few tasks
  // shown in "Recent Tasks", so they're right however many tasks there are.
  const fetchTasks = useCallback(async () => {
    const today = lagosToday();
    const [recent, running, entries, completedCount, inProgressCount] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('tasks').select('*').eq('user_id', profile.id).eq('is_timer_running', true).limit(1).maybeSingle(),
      supabase.from('time_entries').select('work_date, hours').eq('user_id', profile.id).gte('work_date', `${today.slice(0, 7)}-01`),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('status', 'completed'),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('status', 'in_progress'),
    ]);
    if (recent.error) return; // keep showing the last good data; the next refresh retries
    const monthEntries = entries.data || [];
    setTasks((recent.data as Task[]) || []);
    setRunningTask((running.data as Task | null) ?? null);
    setStats({
      todayLogged: monthEntries.filter(e => e.work_date === today).reduce((s, e) => s + Number(e.hours), 0),
      monthLogged: monthEntries.reduce((s, e) => s + Number(e.hours), 0),
      completed: completedCount.count ?? 0,
      inProgress: inProgressCount.count ?? 0,
    });
    setLoading(false);
  }, [supabase, profile.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchTasks(); }, 0);
    // Refresh while the tab is visible; skip while it's in the background.
    const refresh = window.setInterval(() => { if (!document.hidden) void fetchTasks(); }, 15000);
    const onVisible = () => { if (!document.hidden) void fetchTasks(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearTimeout(timer); window.clearInterval(refresh); document.removeEventListener('visibilitychange', onVisible); };
  }, [fetchTasks]);

  // Live timer tick
  // Keyed on the start time so the 15-second refresh doesn't restart the tick.
  const timerStart = runningTask?.timer_start_time ?? null;
  useEffect(() => {
    if (!timerStart) return;
    const tick = () => {
      const now = Date.now();
      const lagosMidnight = new Date(`${lagosToday()}T00:00:00+01:00`).getTime();
      setLiveSeconds(Math.floor((now - new Date(timerStart).getTime()) / 1000));
      // Only the part of a running session since Lagos midnight counts as today.
      setLiveTodaySeconds(Math.floor((now - Math.max(lagosMidnight, new Date(timerStart).getTime())) / 1000));
    };
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [timerStart]);

  // A running timer isn't in the time log until it stops, so add its live time.
  const todayHours = stats.todayLogged + (runningTask ? liveTodaySeconds / 3600 : 0);
  const monthHours = stats.monthLogged + (runningTask ? liveSeconds / 3600 : 0);
  const { completed, inProgress } = stats;

  const formatLive = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const recentTasks = tasks.slice(0, 5);

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <div className="flex items-center gap-3">
          <Avatar src={profile.avatar_url} name={profile.full_name} size={48} />
          <div>
            <h1 className="page-title">
              Hey, {profile.full_name?.split(' ')[0] || 'there'} 👋
            </h1>
            <p className="page-subtitle">
              {profile.department ? `${profile.department} · ` : ''}Ready to get things done?
            </p>
          </div>
        </div>
      </motion.div>

      {/* Live Timer Banner */}
      {runningTask && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-6 p-4 rounded-2xl flex items-center gap-4"
          style={{
            background: 'linear-gradient(135deg, rgba(124,91,246,0.15), rgba(56,189,248,0.1))',
            border: '1px solid rgba(124,91,246,0.3)',
          }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(124,91,246,0.2)' }}>
            <Play size={18} style={{ color: 'var(--accent-violet)' }} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Timer Running</p>
            <p className="font-semibold truncate">{runningTask.title}</p>
          </div>
          <div className="text-2xl font-bold font-mono timer-pulse" style={{ color: 'var(--accent-violet)' }}>
            {formatLive(liveSeconds)}
          </div>
          <a href="/dashboard/employee/tasks" className="btn-primary py-2 text-sm">Manage</a>
        </motion.div>
      )}

      {/* Stats */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Today's Hours", value: `${todayHours.toFixed(1)}h`, icon: Clock, color: 'violet', sub: 'Logged today' },
          { label: 'This Month', value: `${monthHours.toFixed(1)}h`, icon: TrendingUp, color: 'sky', sub: 'Hours logged' },
          { label: 'Completed', value: completed, icon: CheckSquare, color: 'emerald', sub: 'Tasks done' },
          { label: 'In Progress', value: inProgress, icon: Target, color: 'amber', sub: 'Active tasks' },
        ].map(card => (
          <motion.div key={card.label} variants={item} className={`stat-card ${card.color}`}>
            {loading
              ? <div className="skeleton h-16 w-full rounded-xl" />
              : <>
                  <div className="flex items-center gap-2 mb-3">
                    <card.icon size={16} style={{
                      color: card.color === 'violet' ? 'var(--accent-violet)'
                        : card.color === 'sky' ? 'var(--accent-sky)'
                        : card.color === 'emerald' ? 'var(--accent-emerald)'
                        : 'var(--accent-amber)'
                    }} />
                  </div>
                  <p className="text-2xl font-bold mb-0.5">{card.value}</p>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{card.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{card.sub}</p>
                </>
            }
          </motion.div>
        ))}
      </motion.div>

      {/* Recent Tasks + Quick Links */}
      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="card-title">Recent Tasks</h2>
            <a href="/dashboard/employee/tasks" className="text-xs font-medium" style={{ color: 'var(--accent-violet)' }}>
              View all →
            </a>
          </div>
          <div className="space-y-3">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="skeleton w-8 h-8 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-3 w-40" />
                      <div className="skeleton h-2 w-20" />
                    </div>
                  </div>
                ))
              : recentTasks.length === 0
                ? <p className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No tasks yet. <a href="/dashboard/employee/tasks" style={{ color: 'var(--accent-violet)' }}>Add your first task →</a>
                  </p>
                : recentTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--bg-hover)] transition-colors">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background: task.status === 'completed' ? 'rgba(16,217,138,0.15)'
                            : task.status === 'blocked' ? 'rgba(244,63,94,0.15)'
                            : 'rgba(245,158,11,0.15)'
                        }}>
                        {task.is_timer_running
                          ? <Play size={14} style={{ color: 'var(--accent-violet)' }} />
                          : task.status === 'completed'
                            ? <CheckSquare size={14} style={{ color: 'var(--accent-emerald)' }} />
                            : <Clock size={14} style={{ color: 'var(--accent-amber)' }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {task.hours_spent.toFixed(2)}h · {formatDateOnly(task.date_worked)}
                        </p>
                      </div>
                      {task.is_timer_running && (
                        <span className="w-2 h-2 rounded-full timer-pulse" style={{ background: 'var(--accent-emerald)' }} />
                      )}
                    </div>
                  ))
            }
          </div>
        </motion.div>

        {/* Quick Links */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="card">
          <h2 className="card-title mb-5">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Log a Task', href: '/dashboard/employee/tasks', icon: Plus, color: '#7c5bf6', desc: 'Track new work' },
              { label: 'My Profile', href: '/dashboard/employee/profile', icon: Target, color: '#10d98a', desc: 'Edit your info' },
              { label: 'Team Chat', href: '/dashboard/chat', icon: Zap, color: '#38bdf8', desc: 'Collaborate live' },
              { label: 'Task History', href: '/dashboard/employee/tasks', icon: Calendar, color: '#f59e0b', desc: 'View all logs' },
            ].map(a => (
              <a key={a.label} href={a.href}
                className="flex flex-col p-4 rounded-2xl transition-all hover:scale-[1.02]"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${a.color}20` }}>
                  <a.icon size={18} style={{ color: a.color }} />
                </div>
                <p className="text-sm font-semibold mb-0.5">{a.label}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.desc}</p>
              </a>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
