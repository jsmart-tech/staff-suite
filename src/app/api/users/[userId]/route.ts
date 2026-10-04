import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

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
