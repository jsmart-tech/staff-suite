import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const ROLES = new Set(['admin', 'accountant', 'employee']);

/**
 * PATCH /api/users/[userId] — admins edit a staff member's name, role,
 * department, pay rate and phone. The update runs as the signed-in admin so
 * the database records who changed role/rate (profile_change_log) and refuses
 * to remove the last admin.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { userId } = await context.params;

    const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (caller?.role !== 'admin') return NextResponse.json({ error: 'Only admins can edit staff.' }, { status: 403 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
    if ('full_name' in body) patch.full_name = text(body.full_name);
    if ('department' in body) patch.department = text(body.department);
    if ('phone' in body) patch.phone = text(body.phone);
    if ('role' in body) {
      if (!ROLES.has(String(body.role))) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
      patch.role = body.role;
    }
    if ('hourly_rate' in body) {
      const rate = Number(body.hourly_rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100000) return NextResponse.json({ error: 'Hourly rate must be a dollar amount of 0 or more.' }, { status: 400 });
      patch.hourly_rate = Math.round(rate * 100) / 100;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

    const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: 'User was not found.' }, { status: 404 });
    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { userId } = await context.params;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.id === userId) return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: caller } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (caller?.role !== 'admin') return NextResponse.json({ error: 'Only admins can delete users.' }, { status: 403 });
    const { data: target } = await admin.from('profiles').select('role').eq('id', userId).single();
    if (!target) return NextResponse.json({ error: 'User was not found.' }, { status: 404 });
    if (target.role === 'admin') {
      const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin');
      if ((count || 0) <= 1) return NextResponse.json({ error: 'Keep at least one administrator account.' }, { status: 400 });
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
