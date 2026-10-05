import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendNotificationEmails } from '@/lib/email';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const secret = process.env.CHAT_REMINDER_CRON_SECRET || process.env.CRON_SECRET;
  const providedSecret = request.headers.get('x-cron-secret')
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secret || providedSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: reminders, error } = await admin.from('chat_email_notifications')
    .select('id, recipient_email, message_type, channel, sender_name, message_preview')
    .lte('due_at', new Date().toISOString())
    .is('seen_at', null)
    .is('sent_at', null)
    .order('due_at')
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!reminders?.length) return NextResponse.json({ processed: 0 });

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const result = await sendNotificationEmails(reminders.map((reminder) => ({
    to: reminder.recipient_email,
    subject: reminder.message_type === 'direct'
      ? `Unread direct message from ${reminder.sender_name}`
      : `Unread messages in #${reminder.channel}`,
    heading: reminder.message_type === 'direct'
      ? `${reminder.sender_name} sent you a message`
      : `${reminder.sender_name} posted in #${reminder.channel}`,
    body: reminder.message_preview,
    actionUrl: `${site}/dashboard/chat`,
    actionLabel: 'Open chat',
  })));
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });

  const { error: updateError } = await admin.from('chat_email_notifications')
    .update({ sent_at: new Date().toISOString() })
    .in('id', reminders.map((reminder) => reminder.id));
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ processed: reminders.length });
}
