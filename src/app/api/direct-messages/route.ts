import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { sendNotificationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { recipientId, content } = await request.json();
    if (!recipientId || recipientId === user.id || typeof content !== 'string' || !content.trim()) return NextResponse.json({ error: 'Choose another staff member and enter a message.' }, { status: 400 });
    if (content.trim().length > 5000) return NextResponse.json({ error: 'Messages are limited to 5,000 characters.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: recipient } = await admin.from('profiles').select('email, full_name').eq('id', recipientId).single();
    const { data: sender } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
    if (!recipient) return NextResponse.json({ error: 'Recipient was not found.' }, { status: 404 });

    const [member_one, member_two] = [user.id, recipientId].sort();
    let { data: conversation } = await admin.from('direct_conversations')
      .select('id').eq('member_one', member_one).eq('member_two', member_two).maybeSingle();
    if (!conversation) {
      const created = await admin.from('direct_conversations').insert({ member_one, member_two }).select('id').single();
      if (created.error) return NextResponse.json({ error: created.error.message }, { status: 400 });
      conversation = created.data;
    }

    const { data: message, error } = await admin.from('direct_messages').insert({
      conversation_id: conversation.id, sender_id: user.id, content: content.trim(),
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const email = await sendNotificationEmail({
      to: recipient.email, subject: `New direct message from ${sender?.full_name || 'a teammate'}`,
      heading: `New message from ${sender?.full_name || 'a teammate'}`,
      body: content.trim(), actionUrl: `${site}/dashboard/chat`, actionLabel: 'Open message',
    });
    return NextResponse.json({ message, conversationId: conversation.id, emailSent: email.sent });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
