import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// A session opened from an invite or password-reset email link may set a new
// password without the old one, for this long after the link was used.
const LINK_SESSION_MAX_AGE_SECONDS = 60 * 60;

/**
 * Who may set a password here (without knowing the current one):
 *  - someone who just arrived from an invite or reset email link (the session's
 *    verified `amr` claim records a link sign-in, not a password sign-in), or
 *  - an invited user who hasn't set a password yet (server-only app_metadata).
 * A person who merely has an open signed-in session can't, so a borrowed or
 * unattended browser can't be used to take over the account.
 */
async function checkAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, allowed: false };

  const { data } = await supabase.auth.getClaims();
  const amr = (data?.claims?.amr ?? []) as Array<{ method?: string; timestamp?: number }>;
  const now = Math.floor(Date.now() / 1000);
  const recentLinkSignIn = amr.some(entry =>
    entry.method !== 'password'
    && typeof entry.timestamp === 'number'
    && now - entry.timestamp <= LINK_SESSION_MAX_AGE_SECONDS);
  const mustSetPassword = user.app_metadata?.must_set_password === true;

  return { user, allowed: recentLinkSignIn || mustSetPassword };
}

/** GET — tells the page whether to show the form or ask for a new link. */
export async function GET() {
  const { user, allowed } = await checkAccess();
  return NextResponse.json({ signedIn: Boolean(user), allowed });
}

/** POST { password } — sets the password and completes the invitation. */
export async function POST(request: Request) {
  const { user, allowed } = await checkAccess();
  if (!user) return NextResponse.json({ error: 'Your link has expired. Request a new one from the login page.' }, { status: 401 });
  if (!allowed) {
    return NextResponse.json({ error: 'For security, use the password reset link from your email. On the login page, choose "Forgot password" to get a new one.' }, { status: 403 });
  }

  const { password } = await request.json().catch(() => ({})) as { password?: unknown };
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    return NextResponse.json({ error: 'Password must be 6 to 72 characters.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    // Server-only flag: the user can't clear it themselves to skip this step.
    app_metadata: { must_set_password: false },
    user_metadata: { must_set_password: false },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from('profiles').update({ invitation_accepted: true }).eq('id', user.id);
  return NextResponse.json({ success: true });
}
