'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const type = query.get('type') ?? hash.get('type');
    const isPasswordLink = type === 'invite' || type === 'recovery';

    // Older invitation emails can redirect to `/` instead of `/auth/callback`.
    // Preserve their credentials and route them to the password-set screen.
    if (isPasswordLink && hash.get('access_token') && hash.get('refresh_token')) {
    window.location.replace(type === 'recovery' ? `/reset-password${window.location.hash}` : `/accept-invite${window.location.hash}`);
      return;
    }

    // A PKCE code or token hash in an older link still needs the server callback.
    if (isPasswordLink && (query.get('code') || query.get('token_hash'))) {
      window.location.replace(`/auth/callback${window.location.search}`);
      return;
    }

    // Never let an unverified recovery marker open the password form. A
    // repeat or expired link must not reuse an existing signed-in session.
    if (type === 'recovery') {
      window.location.replace('/login?error=expired_recovery_link');
      return;
    }

    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? '/dashboard' : '/login');
    });
  }, [router]);

  return <main className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">Loading…</main>;
}
