import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const channels = new Set(['general', 'announcements', 'random', 'hr', 'finance']);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { type, id } = await request.json();
    const admin = createAdminClient();
    let scopeKey: string;

    if (type === 'channel' && channels.has(id)) {
      scopeKey = `channel:${id}`;
    } else if (type === 'direct' && typeof id === 'string') {
      const { data: conversation } = await admin.from('direct_conversations')
        .select('member_one, member_two').eq('id', id).maybeSingle();
      if (!conversation || (conversation.member_one !== user.id && conversation.member_two !== user.id)) {
        return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
      }
      scopeKey = `direct:${id}`;
    } else {
      return NextResponse.json({ error: 'A valid chat location is required.' }, { status: 400 });
    }

    const { error } = await admin.from('chat_email_notifications')
      .update({ seen_at: new Date().toISOString() })
      .eq('recipient_id', user.id).eq('scope_key', scopeKey).is('sent_at', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
