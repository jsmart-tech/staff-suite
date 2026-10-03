'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Profile, UserRole } from '@/types';
import { getInitials, getRoleBadgeColor, formatCurrency } from '@/lib/utils';
import {
  Search, Plus, Edit2, X, Loader2, Users,
  Mail, Phone, Building, DollarSign, UserCog, Send,
} from 'lucide-react';

const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Finance', 'Operations', 'HR', 'Sales', 'Legal'];
const ROLES: UserRole[] = ['admin', 'accountant', 'employee'];

const ROLE_INFO = {
  admin:      { color: '#7c5bf6', bg: 'rgba(124,91,246,0.12)', label: 'Admin',      desc: 'Full platform access including staff, payroll, and settings.' },
  accountant: { color: '#10d98a', bg: 'rgba(16,217,138,0.12)',  label: 'Accountant', desc: 'Access to hours, payroll summaries, and staff lookup.' },
  employee:   { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  label: 'Employee',   desc: 'Personal task dashboard, timer, profile, and team chat.' },
};

const defaultInvite = { full_name: '', email: '', role: 'employee' as UserRole, department: '', hourly_rate: 0 };

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<Profile[]>([]);
  const [filtered, setFiltered] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState(defaultInvite);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const supabase = createClient();

  const fetchStaff = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setStaff(data as Profile[] || []);
    setFiltered(data as Profile[] || []);
    setLoading(false);
  };

  useEffect(() => { fetchStaff(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(staff.filter(s =>
      s.full_name?.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.department?.toLowerCase().includes(q) ||
      s.role.includes(q)
    ));
  }, [search, staff]);

  const handleSave = async () => {
    if (!editingProfile) return;
    setSaving(true);
    setError('');
    const { error } = await supabase.from('profiles').update({
      full_name: editingProfile.full_name,
      role: editingProfile.role,
      department: editingProfile.department,
      hourly_rate: editingProfile.hourly_rate,
      phone: editingProfile.phone,
    }).eq('id', editingProfile.id);

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Profile updated successfully!');
      setEditingProfile(null);
      fetchStaff();
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  };

  const handleInvite = async () => {
    setInviteError('');
    if (!invite.email) { setInviteError('Email is required.'); return; }
    setInviting(true);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invite),
      });
      const contentType = res.headers.get('content-type') || '';
      const json = contentType.includes('application/json')
        ? await res.json() as { error?: string }
        : null;

      if (!res.ok) {
        throw new Error(
          json?.error || 'The server returned an unexpected response. Please sign in again and retry.'
        );
      }

      if (!json) {
        throw new Error('The server returned an unexpected response. Please try again.');
      }

      setInviteSuccess(`Invitation sent to ${invite.email}!`);
      setInvite(defaultInvite);
      setTimeout(() => { setInviteSuccess(''); setShowInvite(false); }, 2500);
      fetchStaff();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Staff Management</h1>
          <p className="page-subtitle">Manage roles, departments, and rates for all team members</p>
        </div>
        <button
          id="invite-user-btn"
          onClick={() => { setShowInvite(true); setInviteError(''); setInviteSuccess(''); }}
          className="btn-primary flex-shrink-0"
        >
          <Plus size={16} />
          Invite User
        </button>
      </motion.div>

      {/* Success/Error toast */}
      {(success || error) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-xl text-sm"
          style={{
            background: success ? 'rgba(16,217,138,0.1)' : 'rgba(244,63,94,0.1)',
            border: `1px solid ${success ? 'rgba(16,217,138,0.3)' : 'rgba(244,63,94,0.3)'}`,
            color: success ? '#10d98a' : '#f43f5e',
          }}
        >
          {success || error}
        </motion.div>
      )}

      {/* Search + Stats */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, department..."
            className="input-field pl-9"
          />
        </div>
        <div className="flex gap-3">
          {(['admin', 'accountant', 'employee'] as UserRole[]).map((role) => (
            <div key={role} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <span className={`badge ${getRoleBadgeColor(role)}`}>{role}</span>
              <span>{staff.filter(s => s.role === role).length}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Staff Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card-flush"
      >
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Role</th>
                <th>Department</th>
                <th>Hourly Rate</th>
                <th>Phone</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j}><div className="skeleton h-4 rounded" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #7c5bf6, #38bdf8)', color: 'white' }}>
                            {getInitials(s.full_name)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{s.full_name || 'Unnamed'}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${getRoleBadgeColor(s.role)}`}>{s.role}</span>
                      </td>
                      <td>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {s.department || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm font-medium" style={{ color: 'var(--accent-emerald)' }}>
                          {formatCurrency(s.hourly_rate)}/hr
                        </span>
                      </td>
                      <td>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {s.phone || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => setEditingProfile({ ...s })}
                          className="p-2 rounded-lg transition-colors hover:bg-[rgba(124,91,246,0.15)]"
                          style={{ color: 'var(--accent-violet)' }}
                        >
                          <Edit2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
              }
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    <p>No staff members found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Edit Modal */}
      {editingProfile && (
        <div className="modal-backdrop">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="modal-panel"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: 'linear-gradient(135deg, #7c5bf6, #5b3fd4)', color: 'white' }}>
                  {getInitials(editingProfile.full_name)}
                </div>
                <div>
                  <h3 className="font-semibold">Edit Profile</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{editingProfile.email}</p>
                </div>
              </div>
              <button onClick={() => setEditingProfile(null)}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <UserCog size={12} className="inline mr-1" />Full Name
                </label>
                <input
                  type="text"
                  value={editingProfile.full_name || ''}
                  onChange={e => setEditingProfile({ ...editingProfile, full_name: e.target.value })}
                  className="input-field"
                  placeholder="Full name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Role
                  </label>
                  <select
                    value={editingProfile.role}
                    onChange={e => setEditingProfile({ ...editingProfile, role: e.target.value as UserRole })}
                    className="input-field"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <Building size={12} className="inline mr-1" />Department
                  </label>
                  <select
                    value={editingProfile.department || ''}
                    onChange={e => setEditingProfile({ ...editingProfile, department: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Select dept...</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <DollarSign size={12} className="inline mr-1" />Hourly Rate ($)
                  </label>
                  <input
                    type="number"
                    value={editingProfile.hourly_rate}
                    onChange={e => setEditingProfile({ ...editingProfile, hourly_rate: Number(e.target.value) })}
                    className="input-field"
                    min={0}
                    step={100}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <Phone size={12} className="inline mr-1" />Phone
                  </label>
                  <input
                    type="tel"
                    value={editingProfile.phone || ''}
                    onChange={e => setEditingProfile({ ...editingProfile, phone: e.target.value })}
                    className="input-field"
                    placeholder="+234 ..."
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingProfile(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Invite User Modal ── */}
      {showInvite && (
        <div className="modal-backdrop">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="modal-panel w-full max-w-[480px]"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#7c5bf6,#5b3fd4)' }}>
                  <Send size={17} className="text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Invite Team Member</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>They&apos;ll receive an email with a sign-up link</p>
                </div>
              </div>
              <button onClick={() => setShowInvite(false)}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Full name */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <UserCog size={12} className="inline mr-1" />Full Name
                </label>
                <input
                  type="text"
                  value={invite.full_name}
                  onChange={e => setInvite({ ...invite, full_name: e.target.value })}
                  placeholder="Jane Doe"
                  className="input-field"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <Mail size={12} className="inline mr-1" />Email Address *
                </label>
                <input
                  type="email"
                  value={invite.email}
                  onChange={e => setInvite({ ...invite, email: e.target.value })}
                  placeholder="jane@company.com"
                  className="input-field"
                />
              </div>

              {/* Role selector */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Role *</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map(r => {
                    const info = ROLE_INFO[r];
                    const active = invite.role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setInvite({ ...invite, role: r })}
                        className="py-2.5 px-3 rounded-xl text-xs font-semibold transition-all border"
                        style={{
                          background: active ? info.bg : 'var(--bg-secondary)',
                          color: active ? info.color : 'var(--text-muted)',
                          borderColor: active ? info.color + '55' : 'var(--border)',
                        }}
                      >
                        {info.label}
                      </button>
                    );
                  })}
                </div>
                {/* Role description */}
                <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {ROLE_INFO[invite.role].desc}
                </p>
              </div>

              {/* Department + Hourly Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <Building size={12} className="inline mr-1" />Department
                  </label>
                  <select
                    value={invite.department}
                    onChange={e => setInvite({ ...invite, department: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Select dept...</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <DollarSign size={12} className="inline mr-1" />Hourly Rate ($)
                  </label>
                  <input
                    type="number"
                    value={invite.hourly_rate || ''}
                    onChange={e => setInvite({ ...invite, hourly_rate: Number(e.target.value) })}
                    className="input-field"
                    min={0}
                    step={100}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Feedback */}
              {inviteError && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.25)' }}>
                  {inviteError}
                </p>
              )}
              {inviteSuccess && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(16,217,138,0.1)', color: '#10d98a', border: '1px solid rgba(16,217,138,0.25)' }}>
                  ✓ {inviteSuccess}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowInvite(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleInvite} disabled={inviting} className="btn-primary flex-1">
                  {inviting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {inviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
