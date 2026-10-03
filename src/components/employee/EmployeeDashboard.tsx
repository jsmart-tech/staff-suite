'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Profile, Task } from '@/types';
import { getInitials, formatHours } from '@/lib/utils';
import {
  CheckSquare, Clock, TrendingUp, Play, Pause,
  Plus, Target, Calendar, Zap,
} from 'lucide-react';

export function EmployeeDashboard({ profile }: { profile: Profile }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const supabase = createClient();

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setTasks(data as Task[] || []);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Live timer tick
  const runningTask = tasks.find(t => t.is_timer_running);
  useEffect(() => {
    if (!runningTask?.timer_start_time) return;
    const tick = () => {
      const elapsed = (Date.now() - new Date(runningTask.timer_start_time!).getTime()) / 1000;
      setLiveSeconds(Math.floor(elapsed));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [runningTask]);

  const todayHours = tasks
    .filter(t => t.date_worked === new Date().toISOString().split('T')[0])
    .reduce((s, t) => s + t.hours_spent, 0);
  const totalHours = tasks.reduce((s, t) => s + t.hours_spent, 0);
  const completed = tasks.filter(t => t.status === 'completed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;

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
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #7c5bf6, #38bdf8)', color: 'white', fontSize: '16px' }}>
            {getInitials(profile.full_name)}
          </div>
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
          { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, icon: TrendingUp, color: 'sky', sub: 'All time' },
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
                          {task.hours_spent.toFixed(2)}h · {new Date(task.date_worked).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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
