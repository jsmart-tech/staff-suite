import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { scheduleChatReminder } from '@/lib/qstash';

const channels = new Set(['general', 'announcements', 'random', 'hr', 'finance']);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { content, channel, attachmentUrl, attachmentName } = await request.json();
    if (!channels.has(channel) || !content?.trim()) return NextResponse.json({ error: 'A valid channel and message are required.' }, { status: 400 });
    if (content.trim().length > 5000) return NextResponse.json({ error: 'Messages are limited to 5,000 characters.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: sender } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
    const { data: message, error } = await admin.from('chat_messages').insert({ sender_id: user.id, content: content.trim(), channel, attachment_url: attachmentUrl || null, attachment_name: attachmentName || null }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const now = new Date();
    const { data: recipients } = await admin.from('profiles').select('id, email').neq('id', user.id);
    const reminder = (recipients || []).map((recipient) => ({
      recipient_id: recipient.id,
      recipient_email: recipient.email,
      scope_key: `channel:${channel}`,
      message_type: 'channel',
      channel,
      sender_name: sender?.full_name || 'A teammate',
      message_preview: content.trim(),
      due_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      seen_at: null,
      sent_at: null,
    }));
    if (reminder.length) {
      const { data: queuedReminders, error: reminderError } = await admin.from('chat_email_notifications')
        .upsert(reminder, { onConflict: 'recipient_id,scope_key' }).select('id');
      if (reminderError) console.error('Unable to queue chat email reminders:', reminderError.message);
      for (const queuedReminder of queuedReminders || []) {
        const scheduled = await scheduleChatReminder(queuedReminder.id);
        if (scheduled.error) console.error(scheduled.error);
      }
    }
    await admin.from('chat_email_notifications').update({ seen_at: now.toISOString() })
      .eq('recipient_id', user.id).eq('scope_key', `channel:${channel}`).is('sent_at', null);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
