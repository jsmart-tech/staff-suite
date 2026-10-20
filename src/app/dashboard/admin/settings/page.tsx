'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Globe, Save, Loader2, CheckCircle } from 'lucide-react';

interface AppSettings {
  company_name: string;
  work_hours_per_day: number;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    company_name: 'Blessed Path Holdings',
    work_hours_per_day: 8,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const { settings: stored } = await response.json();
          if (stored) setSettings({ company_name: stored.company_name ?? '', work_hours_per_day: Number(stored.work_hours_per_day) || 8 });
        }
      } catch {
        setSaveError('Could not load settings. Refresh the page to try again.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError(result.error || 'Failed to save settings.');
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
        <h1 className="page-title">System Settings</h1>
        <p className="page-subtitle">Configure your Blessed Path Staff Suite workspace</p>
      </motion.div>

      <div className="space-y-5">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(124,91,246,0.15)' }}>
              <Settings size={18} style={{ color: 'var(--accent-violet)' }} />
            </div>
            <h2 className="card-title">Company Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="company-name" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Company Name</label>
              <input
                id="company-name"
                type="text"
                value={settings.company_name}
                onChange={e => setSettings({ ...settings, company_name: e.target.value })}
                className="input-field"
                maxLength={100}
              />
            </div>
            <div>
              <label htmlFor="work-hours" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Standard Work Hours / Day</label>
              <input
                id="work-hours"
                type="number"
                value={settings.work_hours_per_day}
                onChange={e => setSettings({ ...settings, work_hours_per_day: Number(e.target.value) })}
                className="input-field"
                min={1}
                max={24}
              />
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(56,189,248,0.15)' }}>
              <Globe size={18} style={{ color: 'var(--accent-sky)' }} />
            </div>
            <h2 className="card-title">Currency &amp; Time Zone</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Currency', value: 'US Dollar ($)' },
              { label: 'Time zone', value: 'Eastern Time — New York (EST/EDT)' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                <span className="text-sm font-medium">{item.value}</span>
              </div>
            ))}
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              All pay is shown in dollars, and work dates, monthly payroll and the timer&apos;s midnight cut-off follow Eastern time.
            </p>
          </div>
        </motion.div>

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

        {saveError && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl text-sm"
            style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e' }}
          >
            {saveError}
          </motion.div>
        )}

        <button onClick={handleSave} disabled={saving || loading} className="btn-primary w-full">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
