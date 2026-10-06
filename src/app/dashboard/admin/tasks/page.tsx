'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Task, Profile, TaskStatus } from '@/types';
import { getInitials, getStatusColor } from '@/lib/utils';
import {
  Search, CheckSquare, Clock, AlertCircle,
  Plus, X, Loader2, User,
} from 'lucide-react';

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed'   },
  { value: 'blocked',     label: 'Blocked'     },
];

interface AssignForm {
  user_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  hours_spent: number;
  date_worked: string;
  start_date: string;
  due_date: string;
}

const defaultForm: AssignForm = {
  user_id: '',
  title: '',
  description: '',
  status: 'in_progress',
  hours_spent: 0,
  date_worked: new Date().toISOString().split('T')[0],
  start_date: new Date().toISOString().split('T')[0],
  due_date: '',
};

export default function AdminTasksPage() {
  const [tasks,        setTasks]        = useState<(Task & { profiles: Pick<Profile, 'full_name' | 'avatar_url' | 'department'> })[]>([]);
  const [staff,        setStaff]        = useState<Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[]>([]);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState<AssignForm>(defaultForm);
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState('');
  const supabase = createClient();

  /* ── Load tasks + staff list ── */
  const fetchTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*, profiles(full_name, avatar_url, department)')
      .order('created_at', { ascending: false });
    setTasks(data as typeof tasks || []);
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchTasks();
      void supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['admin', 'employee', 'accountant'])
        .order('full_name')
        .then(({ data }) => setStaff(data || []));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  /* ── Filter logic ── */
  const filtered = useMemo(() => {
    let result = tasks;
    if (statusFilter !== 'all') result = result.filter(t => t.status === statusFilter);
    if (dateFilter) result = result.filter(t => t.date_worked === dateFilter || t.start_date === dateFilter || t.due_date === dateFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.profiles?.full_name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [search, statusFilter, tasks]);

  const statusCounts = {
    all:         tasks.length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed:   tasks.filter(t => t.status === 'completed').length,
    blocked:     tasks.filter(t => t.status === 'blocked').length,
  };

  const statusIcon  = { in_progress: Clock, completed: CheckSquare, blocked: AlertCircle };
  const statusLabel = { in_progress: 'In Progress', completed: 'Completed', blocked: 'Blocked' };

  /* ── Assign task submit ── */
  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!form.user_id) { setSaveError('Please select a staff member.'); return; }
    if (!form.title.trim()) { setSaveError('Task title is required.'); return; }

    setSaving(true);
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) { setSaveError(result.error || 'Unable to assign this task.'); return; }

    setShowModal(false);
    setForm(defaultForm);
    fetchTasks(); // refresh list
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">All Tasks</h1>
          <p className="page-subtitle">Global overview of all staff tasks and work logs</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setSaveError(''); setForm(defaultForm); }}
          className="btn-primary"
        >
          <Plus size={16} /> Assign Task
        </button>
      </motion.div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(['all', 'in_progress', 'completed', 'blocked'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: statusFilter === s ? 'rgba(124,91,246,0.15)' : 'var(--bg-card)',
              border: `1px solid ${statusFilter === s ? 'rgba(124,91,246,0.4)' : 'var(--border)'}`,
              color: statusFilter === s ? 'var(--accent-violet)' : 'var(--text-secondary)',
            }}
          >
            {s === 'all' ? 'All' : statusLabel[s]}
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--bg-hover)' }}>
              {statusCounts[s]}
            </span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="input-field pl-8 py-2 text-sm"
            style={{ width: '220px' }}
          />
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            aria-label="Filter tasks by date"
            className="input-field py-2 text-sm"
          />
          {dateFilter && <button type="button" onClick={() => setDateFilter('')} className="btn-secondary px-3 text-sm">Clear date</button>}
        </div>
      </div>

      {/* Tasks Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card-flush">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Assigned To</th>
                <th>Department</th>
                <th>Status</th>
                <th>Hours</th>
                <th>Date Worked</th>
                <th>Timer</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                      <td key={j}><div className="skeleton h-4 rounded" /></td>
                    ))}</tr>
                  ))
                : filtered.map((task) => {
                    const Icon = statusIcon[task.status];
                    return (
                      <tr key={task.id}>
                        <td>
                          <p className="font-medium text-sm max-w-[200px] truncate">{task.title}</p>
                          {task.description && (
                            <p className="text-xs mt-0.5 max-w-[200px] truncate" style={{ color: 'var(--text-muted)' }}>
                              {task.description}
                            </p>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden text-[10px] font-bold"
                              style={{ background: 'linear-gradient(135deg, #7c5bf6, #38bdf8)', color: 'white' }}>
                              {task.profiles?.avatar_url ? <img src={task.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : getInitials(task.profiles?.full_name)}
                            </div>
                            <span className="text-sm">{task.profiles?.full_name || 'Unknown'}</span>
                          </div>
                        </td>
                        <td><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{task.profiles?.department || '—'}</span></td>
                        <td>
                          <span className={`badge ${getStatusColor(task.status)}`}>
                            <Icon size={10} />
                            {statusLabel[task.status]}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm font-semibold" style={{ color: 'var(--accent-sky)' }}>
                            {task.hours_spent.toFixed(2)}h
                          </span>
                        </td>
                        <td>
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {new Date(task.date_worked).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </td>
                        <td>
                          {task.is_timer_running ? (
                            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent-emerald)' }}>
                              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-emerald)' }} />
                              Live
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
              }
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                    <CheckSquare size={32} className="mx-auto mb-2 opacity-30" />
                    <p>No tasks found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ── Assign Task Modal ── */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-[480px] rounded-2xl p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold">Assign Task</h2>
                  <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Task will appear instantly in the staff member&apos;s active tasks
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:opacity-70"
                  style={{ background: 'var(--bg-hover)' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAssign} className="space-y-4">

                {/* Staff selector */}
                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <User size={12} className="inline mr-1" />Assign To
                  </label>
                  <select
                    id="assign-user"
                    value={form.user_id}
                    onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
                    required
                    className="input-field text-sm"
                  >
                    <option value="">— Select staff member —</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name || s.email} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Task Title
                  </label>
                  <input
                    id="assign-title"
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Prepare monthly report"
                    required
                    className="input-field text-sm"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Description <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
                  </label>
                  <textarea
                    id="assign-description"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Additional details about the task..."
                    rows={3}
                    className="input-field text-sm resize-none"
                    style={{ height: 'auto' }}
                  />
                </div>

                {/* Status + Date row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Status
                    </label>
                    <select
                      id="assign-status"
                      value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                      className="input-field text-sm"
                    >
                      {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Date
                    </label>
                    <input
                      id="assign-date"
                      type="date"
                      value={form.date_worked}
                      onChange={e => setForm(f => ({ ...f, date_worked: e.target.value }))}
                      className="input-field text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Start Date</label>
                    <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>End Date</label>
                    <input type="date" min={form.start_date} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input-field text-sm" />
                  </div>
                </div>

                {/* Error */}
                {saveError && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[13px] px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(244,63,94,0.09)', border: '1px solid rgba(244,63,94,0.28)', color: '#f43f5e' }}
                  >
                    {saveError}
                  </motion.p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary flex-1"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {saving ? 'Assigning…' : 'Assign Task'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
