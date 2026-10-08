import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendNotificationEmails, getSiteUrl } from '@/lib/email';

export const runtime = 'nodejs';

async function handler(request: NextRequest) {
  const { notificationId } = await request.json().catch(() => ({})) as { notificationId?: string };
  if (!notificationId) return NextResponse.json({ error: 'notificationId is required.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: reminder, error } = await admin.from('chat_email_notifications')
    .select('id, recipient_email, message_type, channel, sender_name, message_preview')
    .eq('id', notificationId).is('seen_at', null).is('sent_at', null).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!reminder) return NextResponse.json({ processed: 0 });

  const site = getSiteUrl();
  const result = await sendNotificationEmails([{
    to: reminder.recipient_email,
    subject: reminder.message_type === 'direct' ? `Unread direct message from ${reminder.sender_name}` : `Unread messages in #${reminder.channel}`,
    heading: reminder.message_type === 'direct' ? `${reminder.sender_name} sent you a message` : `${reminder.sender_name} posted in #${reminder.channel}`,
    body: reminder.message_preview,
    actionUrl: `${site}/dashboard/chat`,
    actionLabel: 'Open chat',
  }]);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
  const { error: updateError } = await admin.from('chat_email_notifications')
    .update({ sent_at: new Date().toISOString() }).eq('id', reminder.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ processed: 1 });
}

export const POST = verifySignatureAppRouter(handler);
