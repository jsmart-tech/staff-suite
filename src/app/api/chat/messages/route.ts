import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { sendNotificationEmails } from '@/lib/email';

const channels = new Set(['general', 'announcements', 'random', 'hr', 'finance']);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { content, channel } = await request.json();
    if (!channels.has(channel) || !content?.trim()) return NextResponse.json({ error: 'A valid channel and message are required.' }, { status: 400 });
    if (content.trim().length > 5000) return NextResponse.json({ error: 'Messages are limited to 5,000 characters.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: sender } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
    const { data: message, error } = await admin.from('chat_messages').insert({ sender_id: user.id, content: content.trim(), channel }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data: recipients } = await admin.from('profiles').select('email').neq('id', user.id);
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const email = await sendNotificationEmails((recipients || []).map((recipient) => ({
      to: recipient.email, subject: `New message in #${channel}`,
      heading: `${sender?.full_name || 'A teammate'} posted in #${channel}`,
      body: content.trim(), actionUrl: `${site}/dashboard/chat`, actionLabel: 'Open chat',
    })));
    return NextResponse.json({ message, emailSent: email.sent, emailError: email.error });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
