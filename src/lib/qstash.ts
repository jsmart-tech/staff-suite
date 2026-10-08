import { Client } from '@upstash/qstash';

export async function scheduleChatReminder(notificationId: string) {
  const token = process.env.QSTASH_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token || !site) {
    return { error: 'QStash scheduling is not configured.' };
  }

  const callbackUrl = `${site.replace(/\/$/, '')}/api/qstash/chat-email-reminders`;
  const client = new Client({
    ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
    token,
  });

  try {
    const { messageId } = await client.publishJSON({
      url: callbackUrl,
      body: { notificationId },
      delay: '10m',
    });
    return { messageId };
  } catch (error) {
    console.error('QStash scheduling failed:', error);
    return { error: 'Unable to schedule the QStash reminder.' };
  }
}
