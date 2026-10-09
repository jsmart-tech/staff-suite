import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { scheduleChatReminder } from '@/lib/qstash';
import { createNotifications } from '@/lib/notifications';

const channels = new Set(['general', 'announcements', 'random', 'hr', 'finance']);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { content, channel, attachmentUrl, attachmentName, clientMessageId } = await request.json();
    if (!channels.has(channel) || (!content?.trim() && !attachmentUrl)) return NextResponse.json({ error: 'A valid channel message or attachment is required.' }, { status: 400 });
    if ((content || '').trim().length > 5000) return NextResponse.json({ error: 'Messages are limited to 5,000 characters.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: sender } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
    const clientMessageIdValue = typeof clientMessageId === 'string' ? clientMessageId : null;
    const inserted = await admin.from('chat_messages').insert({
      sender_id: user.id,
      content: (content || '').trim(),
      channel,
      attachment_url: attachmentUrl || null,
      attachment_name: attachmentName || null,
      client_message_id: clientMessageIdValue,
    }).select().single();
    let message = inserted.data;
    if (inserted.error?.code === '23505' && clientMessageIdValue) {
      const existing = await admin.from('chat_messages')
        .select('*')
        .eq('sender_id', user.id)
        .eq('client_message_id', clientMessageIdValue)
        .maybeSingle();
      message = existing.data;
      if (existing.error || !message) return NextResponse.json({ error: 'Unable to recover the original message.' }, { status: 409 });
      return NextResponse.json({ message });
    } else if (inserted.error) {
      return NextResponse.json({ error: inserted.error.message }, { status: 400 });
    }

    const now = new Date();
    const { data: recipients } = await admin.from('profiles').select('id, email').neq('id', user.id);
    try {
      await createNotifications({
        actorId: user.id,
        recipientIds: (recipients || []).map(recipient => recipient.id),
        type: 'channel_message',
        title: `New message in #${channel}`,
        body: `${sender?.full_name || 'A teammate'}: ${(content || attachmentName || 'sent an attachment').trim().slice(0, 180)}`,
        href: '/dashboard/chat',
        entityType: 'chat_message',
        entityId: message.id,
        eventKey: `channel-message:${message.id}`,
      });
    } catch (notificationError) {
      console.error('Unable to create channel message notifications:', notificationError);
    }
    const reminder = (recipients || []).map((recipient) => ({
      recipient_id: recipient.id,
      recipient_email: recipient.email,
      scope_key: `channel:${channel}`,
      message_type: 'channel',
      channel,
      sender_name: sender?.full_name || 'A teammate',
      message_preview: (content || attachmentName || 'sent an attachment').trim(),
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
