'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Task, TaskStatus } from '@/types';
import { getStatusColor } from '@/lib/utils';
import {
  Plus, Play, Square, CheckCircle, Clock, AlertCircle,
  Trash2, Edit2, X, Loader2, Filter, Calendar,
} from 'lucide-react';

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
];

interface TaskForm {
  title: string;
  description: string;
  status: TaskStatus;
  hours_spent: number;
  date_worked: string;
}

const defaultForm: TaskForm = {
  title: '',
  description: '',
  status: 'in_progress',
  hours_spent: 0,
  date_worked: new Date().toISOString().split('T')[0],
};

export default function EmployeeTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TaskForm>(defaultForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [liveTimers, setLiveTimers] = useState<Record<string, number>>({});
  const [userId, setUserId] = useState<string>('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();

  const fetchTasks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setTasks(data as Task[] || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Real-time: refresh when admin assigns a new task to this user.
  // userId is already set by fetchTasks, so we can set up the channel
  // synchronously (required — .on() must be called before .subscribe()).
  useEffect(() => {
    if (!userId) return; // wait until fetchTasks has resolved the user
    const channel = supabase
      .channel(`tasks:user_${userId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'tasks',
        filter: `user_id=eq.${userId}`,
      }, () => { fetchTasks(); })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [userId, fetchTasks]);

  // Live timer tick
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setLiveTimers(prev => {
        const next = { ...prev };
        tasks.forEach(t => {
          if (t.is_timer_running && t.timer_start_time) {
            const elapsed = (Date.now() - new Date(t.timer_start_time).getTime()) / 1000;
            next[t.id] = Math.floor(elapsed);
          }
        });
        return next;
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [tasks]);

  const formatTimer = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleStartTimer = async (task: Task) => {
    const now = new Date().toISOString();
    await supabase.from('tasks').update({
      is_timer_running: true,
      timer_start_time: now,
      status: 'in_progress',
    }).eq('id', task.id);
    fetchTasks();
  };

  const handleStopTimer = async (task: Task) => {
    if (!task.timer_start_time) return;
    const elapsed = (Date.now() - new Date(task.timer_start_time).getTime()) / 3600000;
    const newHours = parseFloat((task.hours_spent + elapsed).toFixed(4));
    await supabase.from('tasks').update({
      is_timer_running: false,
      timer_start_time: null,
      hours_spent: newHours,
    }).eq('id', task.id);
    fetchTasks();
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    if (editId) {
      await supabase.from('tasks').update({
        title: form.title,
        description: form.description,
        status: form.status,
        hours_spent: form.hours_spent,
        date_worked: form.date_worked,
      }).eq('id', editId);
    } else {
      await supabase.from('tasks').insert({
        user_id: userId,
        title: form.title,
        description: form.description,
        status: form.status,
        hours_spent: form.hours_spent,
        date_worked: form.date_worked,
      });
    }
    setForm(defaultForm);
    setShowForm(false);
    setEditId(null);
    setSaving(false);
    fetchTasks();
  };

  const handleEdit = (task: Task) => {
    setForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      hours_spent: task.hours_spent,
      date_worked: task.date_worked,
    });
    setEditId(task.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id);
    setDeleteId(null);
    fetchTasks();
  };

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const counts = {
    all: tasks.length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    blocked: tasks.filter(t => t.status === 'blocked').length,
  };

  const totalHoursToday = tasks
    .filter(t => t.date_worked === new Date().toISOString().split('T')[0])
    .reduce((s, t) => s + t.hours_spent, 0);

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between mb-8 gap-4 flex-wrap" style={{ marginBottom: 'var(--section-gap)' }}>
        <div>
          <h1 className="page-title">My Tasks</h1>
          <p className="page-subtitle">
            Track your work · <span style={{ color: 'var(--accent-sky)' }}>{totalHoursToday.toFixed(2)}h</span> logged today
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm(defaultForm); }}
          className="btn-primary"
        >
          <Plus size={16} /> New Task
        </button>
      </motion.div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(['all', 'in_progress', 'completed', 'blocked'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: filter === s ? 'rgba(124,91,246,0.15)' : 'var(--bg-card)',
              border: `1px solid ${filter === s ? 'rgba(124,91,246,0.4)' : 'var(--border)'}`,
              color: filter === s ? 'var(--accent-violet)' : 'var(--text-secondary)',
            }}
          >
            {s === 'all' ? 'All Tasks' : s === 'in_progress' ? 'In Progress' : s === 'completed' ? 'Completed' : 'Blocked'}
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--bg-hover)' }}>
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {/* Task Cards */}
      <div className="space-y-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-4">
                <div className="skeleton h-4 w-48 mb-3 rounded" />
                <div className="skeleton h-3 w-64 rounded" />
              </div>
            ))
          : filtered.length === 0
            ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 card"
              >
                <CheckCircle size={40} className="mx-auto mb-3 opacity-20" />
                <p className="font-medium mb-1">No tasks here</p>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  {filter === 'all' ? 'Create your first task to get started' : `No ${filter.replace('_', ' ')} tasks`}
                </p>
                {filter === 'all' && (
                  <button onClick={() => setShowForm(true)} className="btn-primary mx-auto">
                    <Plus size={15} /> Add Task
                  </button>
                )}
              </motion.div>
            )
            : filtered.map(task => {
                const isRunning = task.is_timer_running;
                const elapsed = liveTimers[task.id] || 0;
                const displayHours = isRunning
                  ? task.hours_spent + elapsed / 3600
                  : task.hours_spent;

                return (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="card p-4"
                    style={isRunning ? { border: '1px solid rgba(124,91,246,0.4)' } : {}}
                  >
                    <div className="flex items-start gap-4">
                      {/* Status indicator */}
                      <div className="mt-0.5">
                        {task.status === 'completed'
                          ? <CheckCircle size={18} style={{ color: 'var(--accent-emerald)' }} />
                          : task.status === 'blocked'
                            ? <AlertCircle size={18} style={{ color: 'var(--accent-rose)' }} />
                            : <Clock size={18} style={{ color: isRunning ? 'var(--accent-violet)' : 'var(--accent-amber)' }} />
                        }
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="font-semibold text-sm mb-0.5">{task.title}</p>
                            {task.description && (
                              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{task.description}</p>
                            )}
                          </div>
                          <span className={`badge text-[11px] flex-shrink-0 ${getStatusColor(task.status)}`}>
                            {task.status.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap">
                          {/* Hours */}
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                            {isRunning ? (
                              <span className="text-sm font-mono font-bold timer-pulse" style={{ color: 'var(--accent-violet)' }}>
                                {formatTimer(elapsed + Math.floor(task.hours_spent * 3600))}
                              </span>
                            ) : (
                              <span className="text-sm font-semibold" style={{ color: 'var(--accent-sky)' }}>
                                {displayHours.toFixed(2)}h
                              </span>
                            )}
                          </div>
                          {/* Date */}
                          <div className="flex items-center gap-1.5">
                            <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {new Date(task.date_worked).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Timer button */}
                        {task.status !== 'completed' && (
                          <button
                            onClick={() => isRunning ? handleStopTimer(task) : handleStartTimer(task)}
                            className="p-2 rounded-lg transition-all"
                            title={isRunning ? 'Stop Timer' : 'Start Timer'}
                            style={{
                              background: isRunning ? 'rgba(244,63,94,0.12)' : 'rgba(124,91,246,0.12)',
                              color: isRunning ? 'var(--accent-rose)' : 'var(--accent-violet)',
                            }}
                          >
                            {isRunning ? <Square size={15} /> : <Play size={15} />}
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(task)}
                          className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteId(task.id)}
                          className="p-2 rounded-lg transition-colors hover:bg-[rgba(244,63,94,0.1)]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })
        }
      </div>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md rounded-2xl p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)' }}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg">{editId ? 'Edit Task' : 'New Task'}</h3>
                <button onClick={() => { setShowForm(false); setEditId(null); }}
                  className="p-2 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Task Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="What are you working on?"
                    className="input-field"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Description (optional)</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Add more details..."
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Status</label>
                    <select
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value as TaskStatus })}
                      className="input-field"
                    >
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Hours Spent</label>
                    <input
                      type="number"
                      value={form.hours_spent}
                      onChange={e => setForm({ ...form, hours_spent: parseFloat(e.target.value) || 0 })}
                      className="input-field"
                      min={0}
                      step={0.25}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Date Worked</label>
                  <input
                    type="date"
                    value={form.date_worked}
                    onChange={e => setForm({ ...form, date_worked: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setShowForm(false); setEditId(null); }} className="btn-secondary flex-1">Cancel</button>
                  <button onClick={handleSave} disabled={saving || !form.title.trim()} className="btn-primary flex-1">
                    {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                    {saving ? 'Saving...' : editId ? 'Update Task' : 'Create Task'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl p-6 text-center"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)' }}
            >
              <Trash2 size={28} className="mx-auto mb-3" style={{ color: 'var(--accent-rose)' }} />
              <h3 className="font-bold text-lg mb-1">Delete Task?</h3>
              <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={() => handleDelete(deleteId)} className="btn-danger flex-1">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
