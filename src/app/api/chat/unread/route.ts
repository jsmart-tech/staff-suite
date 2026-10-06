import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('chat_email_notifications').select('scope_key, conversation_id').eq('recipient_id', user.id).is('seen_at', null).is('sent_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const conversationIds = (data || []).map(item => item.conversation_id).filter(Boolean);
  const { data: conversations } = conversationIds.length
    ? await admin.from('direct_conversations').select('id, member_one, member_two').in('id', conversationIds)
    : { data: [] };
  const directUserIds = (conversations || []).map(item => item.member_one === user.id ? item.member_two : item.member_one);
  return NextResponse.json({ scopes: (data || []).map(item => item.scope_key), directUserIds });
}
