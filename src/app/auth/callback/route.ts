import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * /auth/callback
 *
 * Handles two Supabase auth redirect shapes:
 *
 * 1. PKCE flow  → ?code=...&type=...
 *    The server exchanges the one-time code for an auth session.
 *
 * 2. Implicit / OTP flow → ?type=invite (session is in the URL *hash*)
 *    The hash (#access_token=...) is NEVER sent to the server.
 *    We return a tiny HTML bounce-page whose inline script reads
 *    window.location.hash client-side and forwards to /accept-invite
 *    with the hash intact so the Supabase JS client can process it.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code      = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type      = searchParams.get('type');
  const next      = searchParams.get('next') ?? '/dashboard';

  /* ── PKCE flow: exchange the one-time code for a session ── */
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));

    const dest = (type === 'invite' || type === 'recovery')
      ? '/accept-invite'
      : next;
    return NextResponse.redirect(new URL(dest, req.url));
  }

  /* ── Token-hash flow: verify the token directly ── */
  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as never,
    });

    if (!error) {
      const dest = (type === 'invite' || type === 'recovery')
        ? '/accept-invite'
        : next;
      return NextResponse.redirect(new URL(dest, req.url));
    }

    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));
  }

  /* ── Hash / implicit flow: session is in the browser hash fragment ──
     The server never sees the hash. Return a minimal HTML page whose
     script reads window.location.hash and bounces the browser to the
     correct destination, preserving the hash so Supabase JS can pick
     up the session tokens.                                             */
  const dest = (type === 'invite' || type === 'recovery')
    ? '/accept-invite'
    : next;

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Redirecting…</title>
    <script>
      // Hash fragment is only visible to client-side JS.
      // Forward it to the destination so Supabase can process the session.
      var hash = window.location.hash; // e.g. #access_token=...
      window.location.replace(${JSON.stringify(dest)} + hash);
    </script>
  </head>
  <body style="font-family:sans-serif;color:#888;padding:2rem;">
    Redirecting…
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
