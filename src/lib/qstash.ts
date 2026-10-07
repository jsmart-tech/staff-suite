export async function scheduleChatReminder(notificationId: string) {
  const token = process.env.QSTASH_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token || !site) {
    return { error: 'QStash scheduling is not configured.' };
  }

  const callbackUrl = `${site.replace(/\/$/, '')}/api/qstash/chat-email-reminders`;
  const response = await fetch(`https://qstash.upstash.io/v2/publish/${callbackUrl}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': '10m',
    },
    body: JSON.stringify({ notificationId }),
  });
  if (!response.ok) return { error: `QStash returned ${response.status}.` };
  return {};
}
