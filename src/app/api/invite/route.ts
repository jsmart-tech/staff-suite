import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const REDIRECT = `${SITE}/auth/callback?type=invite`;

export async function POST(req: NextRequest) {
  try {
    // Verify the caller is an authenticated admin
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (callerProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can invite users.' }, { status: 403 });
    }

    const { email, full_name, role, department, hourly_rate } = await req.json();
    if (!email || !role) {
      return NextResponse.json({ error: 'Email and role are required.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const meta = {
      full_name:    full_name    || '',
      role,
      department:   department   || '',
      hourly_rate:  hourly_rate  || 0,
    };

    /* ── Attempt 1: fresh invite ── */
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: meta,
      redirectTo: REDIRECT,
    });

    /* ── Attempt 2: user already exists — delete & re-invite ── */
    if (error) {
      const errorMessage = error.message.toLowerCase();
      const isExisting =
        errorMessage.includes('already') ||
        errorMessage.includes('registered');

      if (!isExisting) {
        // Some other error — surface it directly
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // Find the existing auth user
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

      if (existing) {
        // Delete & re-invite so a fresh email is sent
        await admin.auth.admin.deleteUser(existing.id);
      }

      // Re-invite (now that the old record is gone)
      const { data: data2, error: error2 } = await admin.auth.admin.inviteUserByEmail(email, {
        data: meta,
        redirectTo: REDIRECT,
      });

      if (error2) {
        return NextResponse.json({ error: error2.message }, { status: 400 });
      }

      // Upsert profile with correct role/rate
      if (data2?.user) {
        await admin.from('profiles').upsert({
          id:          data2.user.id,
          email,
          full_name:   full_name   || null,
          role,
          department:  department  || null,
          hourly_rate: hourly_rate || 0,
        }, { onConflict: 'id' });
      }

      return NextResponse.json({ success: true });
    }

    /* ── Success on first attempt ── */
    if (data?.user) {
      await admin.from('profiles').upsert({
        id:          data.user.id,
        email,
        full_name:   full_name   || null,
        role,
        department:  department  || null,
        hourly_rate: hourly_rate || 0,
      }, { onConflict: 'id' });
    }

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
