'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';
import { getInitials, getRoleBadgeColor, formatCurrency } from '@/lib/utils';
import { User, Mail, Phone, Building, DollarSign, Camera, Loader2, Save, CheckCircle } from 'lucide-react';

const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Finance', 'Operations', 'HR', 'Sales', 'Legal'];

export default function EmployeeProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ full_name: '', phone: '', department: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setProfile(data as Profile);
        setForm({ full_name: data.full_name || '', phone: data.phone || '', department: data.department || '' });
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    await supabase.from('profiles').update({
      full_name: form.full_name,
      phone: form.phone,
      department: form.department,
    }).eq('id', profile.id);
    setSaving(false);
    setSaved(true);
    setProfile({ ...profile, ...form });
    setTimeout(() => setSaved(false), 3000);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `avatars/${profile.id}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
      setProfile({ ...profile, avatar_url: publicUrl });
    }
    setUploading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-violet)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Manage your personal information and settings</p>
      </motion.div>

      {/* Avatar Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card mb-5">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #7c5bf6, #38bdf8)', color: 'white' }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : getInitials(profile?.full_name)
              }
            </div>
            <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
              style={{ background: 'var(--accent-violet)' }}>
              {uploading ? <Loader2 size={12} className="animate-spin text-white" /> : <Camera size={12} className="text-white" />}
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </label>
          </div>
          <div>
            <h2 className="text-xl font-bold mb-1">{profile?.full_name || 'Unnamed User'}</h2>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{profile?.email}</p>
            <span className={`badge ${getRoleBadgeColor(profile?.role || 'employee')}`}>
              {profile?.role}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Read-only info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card mb-5">
        <h3 className="font-semibold mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Account Information</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: Mail, label: 'Email', value: profile?.email || '—' },
            { icon: DollarSign, label: 'Hourly Rate', value: formatCurrency(profile?.hourly_rate || 0) + '/hr' },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <div className="flex items-center gap-2 mb-1">
                <item.icon size={13} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
              </div>
              <p className="text-sm font-medium">{item.value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          * Email and hourly rate can only be changed by an Admin.
        </p>
      </motion.div>

      {/* Editable fields */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card">
        <h3 className="font-semibold mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Personal Details</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              <User size={12} className="inline mr-1" />Full Name
            </label>
            <input
              type="text"
              value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              placeholder="Your full name"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Phone size={12} className="inline mr-1" />Phone Number
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="+234 800 000 0000"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Building size={12} className="inline mr-1" />Department
            </label>
            <select
              value={form.department}
              onChange={e => setForm({ ...form, department: e.target.value })}
              className="input-field"
            >
              <option value="">Select your department</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {saved && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-xl text-sm"
              style={{ background: 'rgba(16,217,138,0.1)', border: '1px solid rgba(16,217,138,0.3)', color: '#10d98a' }}
            >
              <CheckCircle size={15} /> Profile saved successfully!
            </motion.div>
          )}

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
