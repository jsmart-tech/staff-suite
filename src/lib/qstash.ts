import { Client } from '@upstash/qstash';

const REMINDER_DELAY_SECONDS = 10 * 60;

function qstashClient() {
  const token = process.env.QSTASH_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token || !site) return null;
  return {
    client: new Client({ ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}), token }),
    callbackUrl: `${site.replace(/\/$/, '')}/api/qstash/chat-email-reminders`,
  };
}

/**
 * Schedules reminder checks for several chat_email_notifications rows in one
 * QStash request. When a check fires before the row's due_at (because newer
 * messages pushed it back), the handler schedules another check for the
 * remaining time — so only one pending job per reminder is ever needed.
 */
export async function scheduleChatReminders(notificationIds: string[], delaySeconds = REMINDER_DELAY_SECONDS) {
  if (notificationIds.length === 0) return {};
  const qstash = qstashClient();
  if (!qstash) return { error: 'QStash scheduling is not configured.' };

  try {
    await qstash.client.batchJSON(notificationIds.map(notificationId => ({
      url: qstash.callbackUrl,
      body: { notificationId },
      delay: Math.max(1, Math.ceil(delaySeconds)),
    })));
    return {};
  } catch (error) {
    console.error('QStash scheduling failed:', error);
    return { error: 'Unable to schedule the QStash reminder.' };
  }
}

export async function scheduleChatReminder(notificationId: string, delaySeconds = REMINDER_DELAY_SECONDS) {
  return scheduleChatReminders([notificationId], delaySeconds);
}
