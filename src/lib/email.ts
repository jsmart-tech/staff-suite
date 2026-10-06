import { Resend } from 'resend';

const sender = process.env.RESEND_FROM_EMAIL || 'Blessed Path Staff Suite <management@blessedpathholdings.com>';

/** Resolves the canonical public URL — never returns localhost in production. */
export function getSiteUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL.includes('localhost')) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  // Fallback: always use the real production domain
  return 'https://staff-suite.vercel.app';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch] ?? ch)
  );
}

function buildHtml(heading: string, body: string, actionUrl: string, actionLabel: string) {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937;padding:24px">
  <h2 style="margin-top:0">${escapeHtml(heading)}</h2>
  <p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(body)}</p>
  <p style="margin:24px 0">
    <a href="${actionUrl}"
       style="display:inline-block;padding:12px 22px;background:#6d45e8;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
      ${escapeHtml(actionLabel)}
    </a>
  </p>
  <p style="font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px;margin-bottom:0">
    You received this because you are a Blessed Path Staff Suite team member.
    Check your account to stay updated.
  </p>
</div>`.trim();
}

export async function sendNotificationEmail({
  to,
  subject,
  heading,
  body,
  actionUrl,
  actionLabel,
}: {
  to: string;
  subject: string;
  heading: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY is not configured.' };

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: sender,
    to,
    subject,
    html: buildHtml(heading, body, escapeHtml(actionUrl), actionLabel),
  });

  return { sent: !error, error: error?.message };
}

export async function sendNotificationEmails(
  notifications: Array<{
    to: string;
    subject: string;
    heading: string;
    body: string;
    actionUrl: string;
    actionLabel: string;
  }>
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: 0, error: 'RESEND_API_KEY is not configured.' };
  if (notifications.length === 0) return { sent: 0 };

  const resend = new Resend(apiKey);
  const emails = notifications.map(({ to, subject, heading, body, actionUrl, actionLabel }) => ({
    from: sender,
    to,
    subject,
    html: buildHtml(heading, body, escapeHtml(actionUrl), actionLabel),
  }));

  let sent = 0;
  for (let index = 0; index < emails.length; index += 100) {
    const { error } = await resend.batch.send(emails.slice(index, index + 100));
    if (error) return { sent, error: error.message };
    sent += Math.min(100, emails.length - index);
  }
  return { sent };
}
