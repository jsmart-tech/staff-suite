import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'Unable to load notifications.' }, { status: 400 });

  return NextResponse.json({ notifications: data || [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids, all } = await request.json().catch(() => ({}));
  let query = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', user.id);
  if (all) query = query.is('read_at', null);
  else if (Array.isArray(ids) && ids.length) query = query.in('id', ids);
  else return NextResponse.json({ error: 'Notification IDs are required.' }, { status: 400 });

  const { error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to update notifications.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
