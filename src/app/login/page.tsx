'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Mail, Lock, Eye, EyeOff, Loader2, Zap,
  Users, BarChart3, MessageSquare, CheckCircle, User,
  Shield, UserCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/* ─────────────────────────────────────────────────────────────
   Spacing scale used throughout this page
   ──────────────────────────────────────────────────────────────
   4px   → gap-1 / p-1
   8px   → gap-2 / p-2
   12px  → gap-3 / p-3
   16px  → gap-4 / p-4   ← card internal padding, small sections
   20px  → gap-5 / p-5   ← form field groups (space-y-5)
   24px  → gap-6 / mb-6  ← major form sections
   32px  → mt-8          ← hint box separation
   48px  → py-12         ← right panel vertical padding
   56px  → px-14 / pt-14 ← left panel content padding
   64px  → px-16 / pt-16 ← left panel max padding on XL
───────────────────────────────────────────────────────────── */

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]           = useState('');
  const [fullName, setFullName]     = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [error, setError]           = useState('');
  const [mode, setMode]             = useState<'login' | 'signup'>('login');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'accountant' | 'employee'>('employee');
  const supabase = createClient();

  /* ── Redirect invite links to the set-password page ──
     Supabase appends ?type=invite to the redirectTo URL and puts the
     session tokens in the hash. The client auto-processes the hash, so
     by the time this effect runs the user is already signed in.       */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash   = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
    const isRecovery = params.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
    if (isRecovery && hash.includes('access_token')) {
      router.replace(`/reset-password${hash}`);
      return;
    }
    if (params.get('type') === 'invite' && hash.includes('access_token')) {
      router.replace('/accept-invite');
    }
  }, [router]);

  /* ── Auth handler — untouched ── */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'expired_recovery_link') {
      setError('This password reset link has expired or has already been used. Request a new one to continue.');
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showReset) {
      await handlePasswordReset();
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('login_logs').insert({ user_id: user.id, ip_address: null });
        router.push('/dashboard');
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setError('✓ Account created! Check your email to confirm, then sign in.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then select Forgot password.');
      return;
    }
    setResetLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${(process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '')}/reset-password`,
      });
      if (error) throw error;
      setError('✓ If an account exists for this email, a password reset link has been sent.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send a password reset email.');
    } finally {
      setResetLoading(false);
    }
  };

  const features = [
    { icon: Users,         label: 'Team Management',  desc: 'Manage your entire workforce',    color: '#7c5bf6', bg: 'rgba(124,91,246,0.16)' },
    { icon: BarChart3,     label: 'Payroll Insights',  desc: 'Real-time financial summaries',   color: '#10d98a', bg: 'rgba(16,217,138,0.14)'  },
    { icon: Zap,           label: 'Live Task Tracker', desc: 'Track work hours with precision', color: '#7c5bf6', bg: 'rgba(124,91,246,0.16)' },
    { icon: MessageSquare, label: 'Team Chat',         desc: 'Real-time collaboration',         color: '#38bdf8', bg: 'rgba(56,189,248,0.14)'  },
  ];

  const roles = [
    {
      key: 'admin' as const,
      label: 'Admin',
      icon: Shield,
      color: 'var(--accent-violet)',
      bg: 'rgba(124,91,246,0.12)',
      description: 'Full access to all modules — staff profiles, task oversight, payroll, audit logs, settings, and team chat.',
    },
    {
      key: 'accountant' as const,
      label: 'Accountant',
      icon: BarChart3,
      color: 'var(--accent-emerald)',
      bg: 'rgba(16,217,138,0.12)',
      description: 'Access to task hours, hourly rates, payroll summaries, staff record lookup, and team chat.',
    },
    {
      key: 'employee' as const,
      label: 'Employee',
      icon: UserCircle,
      color: 'var(--accent-sky)',
      bg: 'rgba(56,189,248,0.12)',
      description: 'Access to personal task dashboard with live timer, profile management, and team chat.',
    },
  ];

  const activeRole = roles.find(r => r.key === selectedRole)!;
  const isSuccess = error.startsWith('✓');

  return (
    /*
     * Root: full-viewport flex row.
     * overflow-hidden prevents any orb from creating a scrollbar.
     */
    <div className="min-h-screen flex overflow-hidden">

      {/* ══════════════════════════════════════════════
          LEFT PANEL — Branding / Marketing
          52% width keeps the balance without
          overwhelming the login form at 1280px.
      ══════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, x: -32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="hidden lg:flex flex-col lg:w-[52%] xl:w-[55%] relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0a0c18 0%, #0e1128 50%, #080a16 100%)' }}
      >
        {/* ── Large blob shapes matching reference ── */}
        <div
          className="absolute -top-20 -left-20 w-[420px] h-[420px] rounded-full pointer-events-none select-none"
          style={{ background: 'radial-gradient(circle at 40% 40%, rgba(80,50,200,0.45) 0%, rgba(60,30,160,0.2) 40%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-80px] right-[-60px] w-[380px] h-[380px] rounded-full pointer-events-none select-none"
          style={{ background: 'radial-gradient(circle at 60% 60%, rgba(60,40,180,0.35) 0%, rgba(40,20,140,0.15) 50%, transparent 70%)' }}
        />
        <div
          className="absolute top-[35%] right-[8%] w-[160px] h-[160px] rounded-full pointer-events-none select-none"
          style={{ background: 'radial-gradient(circle, rgba(100,70,220,0.25) 0%, transparent 70%)' }}
        />

        {/*
         * Content column:
         *   px-14 xl:px-16  — 56px / 64px horizontal padding
         *   pt-14            — 56px top: logo well clear of viewport edge
         *   pb-12            — 48px bottom: tagline comfortably inset
         * flex-col + h-full lets logo sit at top, hero centre, tagline bottom.
         */}
        <div className="relative z-10 flex flex-col h-full px-14 xl:px-16 pt-14 pb-12">

          {/* ── Logo ── */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Image src="/babysitting-buddies-logo.png" alt="Babysitting Buddies" width={180} height={120} className="h-16 w-28 object-contain object-left flex-shrink-0" priority />
            <div className="flex flex-col leading-tight">
              <span
                className="text-[1.1rem] font-bold"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Staff<span className="gradient-text">Suite</span>
              </span>
              <span className="text-[11px] tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Staff Management &amp; Productivity
              </span>
            </div>
          </div>

          {/* ── Hero block — flex-1 + justify-center keeps it vertically centred ── */}
          <div className="flex-1 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.55 }}
            >
              {/* Eyebrow */}
              <p
                className="text-[11px] font-semibold tracking-[0.12em] uppercase mb-4"
                style={{ color: 'var(--accent-violet)' }}
              >
                All-in-one platform
              </p>

              {/* Headline — clamp prevents overflow at any supported width */}
              <h1
                className="font-bold leading-[1.1] mb-5"
                style={{
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  fontSize: 'clamp(1.9rem, 2.8vw, 2.75rem)',
                }}
              >
                Run your team<br />
                <span className="gradient-text">smarter &amp; faster</span>
              </h1>

              {/* Supporting copy */}
              <p
                className="text-[0.9rem] leading-[1.65] mb-10 max-w-[340px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Everything your team needs — task tracking, payroll,
                real-time chat, and complete staff oversight in one
                powerful platform.
              </p>

              {/*
               * Feature cards grid:
               *   gap-3 (12px) between cards
               *   p-4 (16px) internal padding — comfortable without being bloated
               *   icon is 32×32, vertically aligned to text cap-height via mt-0.5
               */}
              <div className="grid grid-cols-2 gap-3">
                {features.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.38 + i * 0.07, duration: 0.45 }}
                    className="flex items-start gap-3 p-4 rounded-2xl"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: f.bg }}
                    >
                      <f.icon size={15} style={{ color: f.color }} />
                    </div>
                    <div>
                      <p className="font-semibold text-[13px] mb-0.5">{f.label}</p>
                      <p className="text-[12px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                        {f.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── Footer tagline ── */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Avatar stack */}
            <div className="flex items-center -space-x-2">
              {['#7c5bf6','#10d98a','#38bdf8','#f59e0b'].map((c, i) => (
                <div key={i}
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
                  style={{ background: c, borderColor: '#0a0c18', color: 'white', zIndex: 4 - i }}
                >
                  {['A','B','C','D'][i]}
                </div>
              ))}
              <div
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
                style={{ background: 'rgba(255,255,255,0.08)', borderColor: '#0a0c18', color: '#8b90a8', zIndex: 0 }}
              >+</div>
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: '#c5c8d6' }}>Trusted by modern teams worldwide</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-emerald)' }} />
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Powered by Supabase</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════
          RIGHT PANEL — Login / Signup form
          flex-1 takes remaining width.
          Items-center + justify-center keeps form
          truly centred in the available space.
          px-8 sm:px-12 → consistent edge breathing room.
          py-12 → vertical padding so form never kisses edge.
      ══════════════════════════════════════════════ */}
      <div
        className="flex-1 flex items-center justify-center px-8 sm:px-12 py-12"
        style={{ background: '#090b14' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile-only logo (hidden on lg+) */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c5bf6, #5b3fd4)' }}
            >
              <Zap size={17} className="text-white" />
            </div>
            <span className="text-xl font-bold">
              Blessed Path <span className="gradient-text">Staff Suite</span>
            </span>
          </div>

          {/* ── Form heading ── */}
          {/*
           * mb-7 (28px) between heading block and first form field.
           * This is the single largest section gap on the right side.
           */}
          <div className="mb-7">
            <h2
              className="text-[1.65rem] font-bold leading-tight mb-2"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {mode === 'login'
                ? 'Sign in to access your workspace'
                : 'Set up your Blessed Path Staff Suite account'}
            </p>
          </div>

          {/*
           * Form spacing system:
           *   space-y-5 (20px) between field groups — professional SaaS standard
           *   mb-2 (8px) label → input gap — noticeable but not wasteful
           *   input height controlled by .input-field in globals.css (h-11 / 44px)
           */}
          <form onSubmit={handleAuth} className="space-y-5">

            {/* Full name — signup only */}
            {mode === 'signup' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label
                  className="block text-[13px] font-medium mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Full name
                </label>
                <div className="relative">
                  <User
                    size={14}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="input-field input-with-icon"
                  />
                </div>
              </motion.div>
            )}

            {/* Email */}
            <div>
              <label
                className="block text-[13px] font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="input-field input-with-icon"
                />
              </div>
            </div>

            {/* Password */}
            {!showReset && <div>
              <label
                className="block text-[13px] font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  minLength={6}
                  className="input-field input-with-icon input-with-icon-right"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>}

            {mode === 'login' && !showReset && (
              <div className="flex justify-end -mt-2">
                <button
                  type="button"
                  onClick={() => { setShowReset(true); setError(''); }}
                  disabled={resetLoading}
                  className="text-xs font-semibold transition-opacity hover:opacity-75 disabled:opacity-50"
                  style={{ color: 'var(--accent-violet)' }}
                >
                  {resetLoading ? 'Sending reset link…' : 'Forgot password?'}
                </button>
              </div>
            )}

            {showReset && (
              <button
                type="button"
                onClick={() => { setShowReset(false); setError(''); }}
                className="-mt-2 text-left text-xs font-semibold transition-opacity hover:opacity-75"
                style={{ color: 'var(--accent-violet)' }}
              >
                ← Back to sign in
              </button>
            )}

            {/* Error / success message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 rounded-xl px-4 py-3.5 text-[13px]"
                style={{
                  background: isSuccess ? 'rgba(16,217,138,0.09)' : 'rgba(244,63,94,0.09)',
                  border: `1px solid ${isSuccess ? 'rgba(16,217,138,0.28)' : 'rgba(244,63,94,0.28)'}`,
                  color: isSuccess ? '#10d98a' : '#f43f5e',
                }}
              >
                {isSuccess && <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />}
                <span className="leading-snug">{error}</span>
              </motion.div>
            )}

            {/*
             * Submit button:
             *   h-11 (44px) — standard comfortable click target
             *   mt-1 extra push below password field, in addition to space-y-5
             */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-11 text-[14px] font-semibold mt-1"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {showReset
                ? (resetLoading ? 'Sending reset link…' : 'Send reset link')
                : (loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          {/* ── Toggle login ↔ signup ── */}
          {/* mt-5 (20px) below the button — matches space-y-5 rhythm */}
          <p
            className="mt-5 text-center text-[13px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
              className="font-semibold hover:opacity-75 transition-opacity"
              style={{ color: 'var(--accent-violet)' }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>

        </motion.div>
      </div>
    </div>
  );
}
