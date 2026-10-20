import { createAdminClient } from '@/lib/supabase/admin';
import { getSiteUrl, sendNotificationEmail } from '@/lib/email';
import { scheduleChatReminders } from '@/lib/qstash';

type AdminClient = ReturnType<typeof createAdminClient>;

const REMINDER_DELAY_MS = 10 * 60 * 1000;

export interface ReminderInput {
  recipient_id: string;
  recipient_email: string;
  scope_key: string;
  message_type: 'channel' | 'direct';
  channel?: string;
  conversation_id?: string;
  sender_name: string;
  message_preview: string;
}

/**
 * Queues (or pushes back) a 10-minute unread-message email for each recipient.
 * A recipient whose reminder for this chat is still pending already has a
 * QStash job; it just gets a later due_at. Only recipients without a pending
 * reminder get a new job, all scheduled in a single QStash request.
 */
export async function queueChatReminders(admin: AdminClient, reminders: ReminderInput[]) {
  if (reminders.length === 0) return;
  const scopeKey = reminders[0].scope_key;

  const { data: pending } = await admin.from('chat_email_notifications')
    .select('recipient_id')
    .eq('scope_key', scopeKey)
    .in('recipient_id', reminders.map(r => r.recipient_id))
    .is('sent_at', null)
    .is('seen_at', null);
  const alreadyScheduled = new Set((pending || []).map(row => row.recipient_id));

  const dueAt = new Date(Date.now() + REMINDER_DELAY_MS).toISOString();
  const { data: queued, error } = await admin.from('chat_email_notifications')
    .upsert(reminders.map(r => ({ ...r, due_at: dueAt, seen_at: null, sent_at: null })), { onConflict: 'recipient_id,scope_key' })
    .select('id, recipient_id');
  if (error) {
    console.error('Unable to queue chat email reminders:', error.message);
    return;
  }

  const toSchedule = (queued || []).filter(row => !alreadyScheduled.has(row.recipient_id)).map(row => row.id);
  const scheduled = await scheduleChatReminders(toSchedule);
  if (scheduled.error) console.error(scheduled.error);
}

type ReminderRow = {
  id: string;
  recipient_email: string;
  message_type: string;
  channel: string | null;
  sender_name: string;
  message_preview: string;
};

const REMINDER_COLUMNS = 'id, recipient_email, message_type, channel, sender_name, message_preview';

async function sendReminderEmail(reminder: ReminderRow) {
  const isDirect = reminder.message_type === 'direct';
  return sendNotificationEmail({
    to: reminder.recipient_email,
    subject: isDirect ? `Unread direct message from ${reminder.sender_name}` : `Unread messages in #${reminder.channel}`,
    heading: isDirect ? `${reminder.sender_name} sent you a message` : `${reminder.sender_name} posted in #${reminder.channel}`,
    body: reminder.message_preview,
    actionUrl: `${getSiteUrl()}/dashboard/chat`,
    actionLabel: 'Open chat',
  });
}

/**
 * Claims and sends due reminders. A reminder is claimed (sent_at set) before
 * the email goes out, so a QStash retry and the cron fallback can never both
 * send it; if sending fails the claim is released for the next attempt.
 */
export async function sendDueReminders(admin: AdminClient, ids: string[]) {
  if (ids.length === 0) return { sent: 0, failed: 0 };
  const now = new Date().toISOString();
  const { data: claimed, error } = await admin.from('chat_email_notifications')
    .update({ sent_at: now })
    .in('id', ids)
    .is('sent_at', null)
    .is('seen_at', null)
    .lte('due_at', now)
    .select(REMINDER_COLUMNS);
  if (error) throw new Error(error.message);

  let sent = 0, failed = 0;
  for (const reminder of (claimed || []) as ReminderRow[]) {
    const result = await sendReminderEmail(reminder);
    if (result.sent) { sent++; continue; }
    failed++;
    console.error('Chat reminder email failed:', result.error);
    await admin.from('chat_email_notifications').update({ sent_at: null }).eq('id', reminder.id).eq('sent_at', now);
  }
  return { sent, failed };
}

/** For a reminder that is not due yet: how many seconds until it is (or null if nothing to do). */
export async function secondsUntilDue(admin: AdminClient, id: string) {
  const { data } = await admin.from('chat_email_notifications')
    .select('due_at').eq('id', id).is('sent_at', null).is('seen_at', null).maybeSingle();
  if (!data) return null;
  const seconds = (new Date(data.due_at).getTime() - Date.now()) / 1000;
  return seconds > 0 ? seconds : null;
}
