import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { sendNotificationEmail } from '@/lib/email';

// Invitations must always use the public production domain. Deployment-specific
// Vercel URLs can be protected and would send new employees to Vercel login.
const SITE = process.env.VERCEL
  ? 'https://staff-suite.vercel.app'
  : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const REDIRECT = `${SITE}/auth/callback?type=invite`;
const STAFF_ROLES = new Set(['admin', 'accountant', 'employee']);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Only admins can invite users.' }, { status: 403 });

    const { email, full_name, role, department, hourly_rate } = await req.json();
    if (typeof email !== 'string' || !email.trim() || !STAFF_ROLES.has(role)) {
      return NextResponse.json({ error: 'A valid email and staff role are required.' }, { status: 400 });
    }
    const rate = Number(hourly_rate ?? 0);
    if (!Number.isFinite(rate) || rate < 0) return NextResponse.json({ error: 'Hourly rate must be a non-negative number.' }, { status: 400 });

    const admin = createAdminClient();
    const metadata = { full_name: full_name || '', role, department: department || '', hourly_rate: rate };
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: email.trim(),
      options: { data: metadata, redirectTo: REDIRECT },
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('already') || message.includes('registered')) {
        return NextResponse.json({ error: 'A user with this email already exists. Their account was left unchanged.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data.user) {
      const { error: profileError } = await admin.from('profiles').upsert({
        id: data.user.id,
        email: email.trim(),
        full_name: full_name || null,
        role,
        department: department || null,
        hourly_rate: rate,
      }, { onConflict: 'id' });
      if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    const inviteEmail = await sendNotificationEmail({
      to: email.trim(),
      subject: 'You are invited to Staff Suite',
      heading: 'Welcome to Staff Suite',
      body: `${full_name ? `Hi ${full_name},\n\n` : ''}You have been invited to join the Staff Suite workspace as an ${role}. Click below to create your password and activate your account.`,
      actionUrl: data.properties?.action_link || REDIRECT,
      actionLabel: 'Accept invitation',
    });
    if (inviteEmail.error) {
      return NextResponse.json({ error: `The account was created, but the invitation email could not be sent: ${inviteEmail.error}` }, { status: 502 });
    }

    return NextResponse.json({ success: true, emailSent: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
