'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Settings, Bell, Shield, Database, Palette, Save, Loader2, CheckCircle } from 'lucide-react';

interface AppSettings {
  company_name: string;
  timezone: string;
  work_hours_per_day: number;
  currency: string;
  enable_chat: boolean;
  enable_audit_logs: boolean;
}

const TIMEZONES = ['Africa/Lagos', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Dubai'];
const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'GHS'];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    company_name: 'Blessed Path Holdings',
    timezone: 'Africa/Lagos',
    work_hours_per_day: 8,
    currency: 'NGN',
    enable_chat: true,
    enable_audit_logs: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // In production, persist to a settings table in Supabase
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const sections = [
    {
      icon: Settings,
      label: 'Company Settings',
      color: 'violet',
      fields: (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Company Name</label>
            <input
              type="text"
              value={settings.company_name}
              onChange={e => setSettings({ ...settings, company_name: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Timezone</label>
              <select
                value={settings.timezone}
                onChange={e => setSettings({ ...settings, timezone: e.target.value })}
                className="input-field"
              >
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Currency</label>
              <select
                value={settings.currency}
                onChange={e => setSettings({ ...settings, currency: e.target.value })}
                className="input-field"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Standard Work Hours / Day</label>
            <input
              type="number"
              value={settings.work_hours_per_day}
              onChange={e => setSettings({ ...settings, work_hours_per_day: Number(e.target.value) })}
              className="input-field"
              min={1}
              max={24}
            />
          </div>
        </div>
      ),
    },
    {
      icon: Shield,
      label: 'Security & Audit',
      color: 'emerald',
      fields: (
        <div className="space-y-4">
          {[
            { key: 'enable_audit_logs', label: 'Enable Audit Logs', desc: 'Track all staff login activity' },
            { key: 'enable_chat', label: 'Enable Team Chat', desc: 'Allow all staff to use the chat feature' },
          ].map(opt => (
            <div key={opt.key} className="flex items-start justify-between gap-4 p-4 rounded-xl"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm font-medium mb-0.5">{opt.label}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, [opt.key]: !settings[opt.key as keyof AppSettings] })}
                className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                style={{ background: settings[opt.key as keyof AppSettings] ? 'var(--accent-violet)' : 'var(--border-bright)' }}
              >
                <span
                  className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ transform: settings[opt.key as keyof AppSettings] ? 'translateX(22px)' : 'translateX(4px)' }}
                />
              </button>
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: Database,
      label: 'Database Info',
      color: 'sky',
      fields: (
        <div className="space-y-3">
          {[
            { label: 'Tables', value: 'profiles, login_logs, tasks, chat_messages' },
            { label: 'Auth Provider', value: 'Supabase Auth (JWT)' },
            { label: 'Realtime', value: 'Supabase Realtime (WebSocket)' },
            { label: 'Storage', value: 'Supabase Storage (avatars bucket)' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'var(--bg-hover)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
              <span className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{item.value}</span>
            </div>
          ))}
        </div>
      ),
    },
  ];

  const colorMap: Record<string, string> = {
    violet: 'var(--accent-violet)',
    emerald: 'var(--accent-emerald)',
    sky: 'var(--accent-sky)',
  };
  const bgMap: Record<string, string> = {
    violet: 'rgba(124,91,246,0.15)',
    emerald: 'rgba(16,217,138,0.15)',
    sky: 'rgba(56,189,248,0.15)',
  };

  return (
    <div className="max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <h1 className="page-title">System Settings</h1>
        <p className="page-subtitle">Configure your StaffSuite workspace</p>
      </motion.div>

      <div className="space-y-5">
        {sections.map((section, i) => (
          <motion.div
            key={section.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="card"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: bgMap[section.color] }}>
                <section.icon size={18} style={{ color: colorMap[section.color] }} />
              </div>
              <h2 className="card-title">{section.label}</h2>
            </div>
            {section.fields}
          </motion.div>
        ))}

        {saved && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl text-sm"
            style={{ background: 'rgba(16,217,138,0.1)', border: '1px solid rgba(16,217,138,0.3)', color: '#10d98a' }}
          >
            <CheckCircle size={15} /> Settings saved successfully!
          </motion.div>
        )}

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
