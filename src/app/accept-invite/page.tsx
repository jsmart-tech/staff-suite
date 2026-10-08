'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, Loader2, Zap, CheckCircle, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function AcceptInvitePage() {
  const router = useRouter();
  const isRecovery = typeof window !== 'undefined'
    && (new URLSearchParams(window.location.search).get('mode') === 'recovery' || window.location.pathname === '/reset-password');
  const supabase = createClient();

  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [done, setDone]                       = useState(false);
  const [sessionReady, setSessionReady]       = useState(false);

  /* ── Establish session from the invite URL hash ──────────────────────
     @supabase/ssr is cookie-based and does NOT auto-process hash tokens.
     We must manually extract the tokens and call setSession() ourselves. */
  useEffect(() => {
    async function initSession() {
      // 1. Try to get an existing session first (handles page refreshes)
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (existing) { setSessionReady(true); return; }

      // 2. Parse the hash fragment: #access_token=...&refresh_token=...
      const hash   = window.location.hash.slice(1); // remove leading '#'
      const params = new URLSearchParams(hash);
      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token:  accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          setSessionReady(true);
          // Clean the hash from the URL without triggering a navigation
          window.history.replaceState(null, '', window.location.pathname);
          return;
        }
        setError(isRecovery ? 'This password reset link is invalid or has expired. Request a new one from the login page.' : 'Invitation link is invalid or has expired. Please ask for a new invite.');
      } else {
        setError(isRecovery ? 'No password reset session was found. Request a new reset link from the login page.' : 'No invitation token found. Please use the link from your email.');
      }
      // Show the form anyway so the user sees the error
      setSessionReady(true);
    }

    initSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const strength = password.length === 0 ? 0
    : password.length < 6  ? 1
    : password.length < 10 ? 2
    : 3;

  const strengthLabel = ['', 'Weak', 'Good', 'Strong'][strength];
  const strengthColor = ['', '#f43f5e', '#f59e0b', '#10d98a'][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password, data: { must_set_password: false } });
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('profiles').update({ invitation_accepted: true }).eq('id', user.id);

      setDone(true);
      // Give user a moment to see the success state, then redirect
      setTimeout(() => router.push('/dashboard'), 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex overflow-hidden">

      {/* ── Left branding panel ── */}
      <motion.div
        initial={{ opacity: 0, x: -32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="hidden lg:flex flex-col lg:w-[52%] xl:w-[55%] relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0a0c18 0%, #0e1128 50%, #080a16 100%)' }}
      >
        {/* Orbs */}
        <div className="absolute -top-20 -left-20 w-[420px] h-[420px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle at 40% 40%, rgba(80,50,200,0.45) 0%, rgba(60,30,160,0.2) 40%, transparent 70%)' }} />
        <div className="absolute bottom-[-80px] right-[-60px] w-[380px] h-[380px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle at 60% 60%, rgba(60,40,180,0.35) 0%, rgba(40,20,140,0.15) 50%, transparent 70%)' }} />

        <div className="relative z-10 flex flex-col h-full px-14 xl:px-16 pt-14 pb-12">
          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c5bf6, #5b3fd4)' }}>
              <Zap size={20} className="text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[1.1rem] font-bold" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Staff<span className="gradient-text">Suite</span>
              </span>
              <span className="text-[11px] tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Staff Management &amp; Productivity
              </span>
            </div>
          </div>

          {/* Hero */}
          <div className="flex-1 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.55 }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                style={{ background: 'rgba(124,91,246,0.15)', border: '1px solid rgba(124,91,246,0.3)' }}
              >
                <ShieldCheck size={30} style={{ color: '#7c5bf6' }} />
              </div>

              <p className="text-[11px] font-semibold tracking-[0.12em] uppercase mb-4"
                style={{ color: 'var(--accent-violet)' }}>
                You&apos;ve been invited
              </p>

              <h1 className="font-bold leading-[1.1] mb-5"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 'clamp(1.9rem, 2.8vw, 2.75rem)' }}>
                Welcome to<br />
                <span className="gradient-text">your workspace</span>
              </h1>

              <p className="text-[0.9rem] leading-[1.65] max-w-[340px]"
                style={{ color: 'var(--text-secondary)' }}>
                You&apos;re just one step away. Create a secure password to activate your account and get started.
              </p>
            </motion.div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-emerald)' }} />
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Secured by Supabase Auth</p>
          </div>
        </div>
      </motion.div>

      {/* ── Right: Set Password form ── */}
      <div className="flex-1 flex items-center justify-center px-8 sm:px-12 py-12"
        style={{ background: '#090b14' }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c5bf6, #5b3fd4)' }}>
              <Zap size={17} className="text-white" />
            </div>
            <span className="text-xl font-bold">
              Staff<span className="gradient-text">Suite</span>
            </span>
          </div>

          {!sessionReady ? (
            /* ── Waiting for session from hash token ── */
            <div className="text-center py-10">
              <Loader2 size={28} className="animate-spin mx-auto mb-4" style={{ color: 'var(--accent-violet)' }} />
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                Verifying your invitation…
              </p>
            </div>
          ) : done ? (
            /* ── Success state ── */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(16,217,138,0.12)', border: '1px solid rgba(16,217,138,0.3)' }}>
                <CheckCircle size={30} style={{ color: '#10d98a' }} />
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                All set!
              </h2>
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                Your account is active. Taking you to your dashboard…
              </p>
              <div className="mt-6 flex justify-center">
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-violet)' }} />
              </div>
            </motion.div>
          ) : (
            <>
              <div className="mb-7">
                <h2 className="text-[1.65rem] font-bold leading-tight mb-2"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {isRecovery ? 'Reset your password' : 'Create your password'}
                </h2>
                <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                  {isRecovery ? 'Choose a new password for your account.' : 'Choose a strong password to secure your account.'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Password */}
                <div>
                  <label className="block text-[13px] font-medium mb-2"
                    style={{ color: 'var(--text-secondary)' }}>
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-muted)' }} />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Create a password"
                      required
                      minLength={6}
                      className="input-field pl-10 pr-11"
                    />
                    <button type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                      style={{ color: 'var(--text-muted)' }}>
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  {/* Strength bar */}
                  {password.length > 0 && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-1">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                            style={{ background: i <= strength ? strengthColor : 'rgba(255,255,255,0.08)' }} />
                        ))}
                      </div>
                      <p className="text-[11px]" style={{ color: strengthColor }}>{strengthLabel}</p>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-[13px] font-medium mb-2"
                    style={{ color: 'var(--text-secondary)' }}>
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-muted)' }} />
                    <input
                      id="confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      className="input-field pl-10 pr-11"
                      style={{
                        borderColor: confirmPassword
                          ? passwordsMatch ? 'rgba(16,217,138,0.4)' : 'rgba(244,63,94,0.4)'
                          : undefined
                      }}
                    />
                    <button type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                      style={{ color: 'var(--text-muted)' }}>
                      {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {confirmPassword && !passwordsMatch && (
                    <p className="text-[11px] mt-1" style={{ color: '#f43f5e' }}>Passwords do not match</p>
                  )}
                  {passwordsMatch && (
                    <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#10d98a' }}>
                      <CheckCircle size={11} /> Passwords match
                    </p>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2.5 rounded-xl px-4 py-3.5 text-[13px]"
                    style={{
                      background: 'rgba(244,63,94,0.09)',
                      border: '1px solid rgba(244,63,94,0.28)',
                      color: '#f43f5e',
                    }}
                  >
                    <span className="leading-snug">{error}</span>
                  </motion.div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !passwordsMatch}
                  className="btn-primary w-full h-11 text-[14px] font-semibold mt-1"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {loading ? 'Updating password…' : isRecovery ? 'Reset Password' : 'Set Password & Sign In'}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
