import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { scheduleChatReminder } from '@/lib/qstash';
import { createNotifications } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { recipientId, content, attachmentUrl, attachmentName, clientMessageId } = await request.json();
    if (!recipientId || recipientId === user.id || (typeof content !== 'string' && !attachmentUrl) || (!content?.trim() && !attachmentUrl)) return NextResponse.json({ error: 'Choose another staff member and enter a message or attachment.' }, { status: 400 });
    if ((content || '').trim().length > 5000) return NextResponse.json({ error: 'Messages are limited to 5,000 characters.' }, { status: 400 });

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

    const clientMessageIdValue = typeof clientMessageId === 'string' ? clientMessageId : null;
    const inserted = await admin.from('direct_messages').insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      content: (content || '').trim(),
      attachment_url: attachmentUrl || null,
      attachment_name: attachmentName || null,
      client_message_id: clientMessageIdValue,
    }).select().single();
    let message = inserted.data;
    if (inserted.error?.code === '23505' && clientMessageIdValue) {
      const existing = await admin.from('direct_messages')
        .select('*')
        .eq('sender_id', user.id)
        .eq('client_message_id', clientMessageIdValue)
        .maybeSingle();
      message = existing.data;
      if (existing.error || !message) return NextResponse.json({ error: 'Unable to recover the original message.' }, { status: 409 });
      return NextResponse.json({ message, conversationId: conversation.id });
    } else if (inserted.error) {
      return NextResponse.json({ error: inserted.error.message }, { status: 400 });
    }

    const now = new Date();
    try {
      // Build a clean notification preview — never expose raw URLs or filenames
      const preview = content?.trim()
        ? content.trim().slice(0, 180)
        : attachmentName
        ? `📎 ${attachmentName.replace(/[-_]/g, ' ').split('.').slice(0, -1).join('.') || 'Attachment'}`
        : '📎 Sent an attachment';
      await createNotifications({
        actorId: user.id,
        recipientIds: [recipientId],
        type: 'direct_message',
        title: 'New private message',
        body: `${sender?.full_name || 'A teammate'}: ${preview}`,
        href: '/dashboard/chat',
        entityType: 'direct_message',
        entityId: message.id,
        eventKey: `direct-message:${message.id}`,
      });
    } catch (notificationError) {
      console.error('Unable to create direct message notification:', notificationError);
    }
    const scopeKey = `direct:${conversation.id}`;
    const emailPreview = content?.trim() || (attachmentName ? `📎 ${attachmentName}` : 'Sent an attachment');
    const { data: queuedReminder, error: reminderError } = await admin.from('chat_email_notifications').upsert({
      recipient_id: recipientId,
      recipient_email: recipient.email,
      scope_key: scopeKey,
      message_type: 'direct',
      conversation_id: conversation.id,
      sender_name: sender?.full_name || 'A teammate',
      message_preview: emailPreview.trim(),
      due_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      seen_at: null,
      sent_at: null,
    }, { onConflict: 'recipient_id,scope_key' }).select('id').single();
    if (reminderError) console.error('Unable to queue direct-message email reminder:', reminderError.message);
    if (queuedReminder) {
      const scheduled = await scheduleChatReminder(queuedReminder.id);
      if (scheduled.error) console.error(scheduled.error);
    }
    await admin.from('chat_email_notifications').update({ seen_at: now.toISOString() })
      .eq('recipient_id', user.id).eq('scope_key', scopeKey).is('sent_at', null);
    return NextResponse.json({ message, conversationId: conversation.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
