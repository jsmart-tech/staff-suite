import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('chat_email_notifications').select('scope_key').eq('recipient_id', user.id).is('seen_at', null).is('sent_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ scopes: (data || []).map(item => item.scope_key) });
}
