import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
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
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
      data: metadata,
      redirectTo: REDIRECT,
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

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
