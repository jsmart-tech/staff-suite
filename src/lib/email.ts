import { Resend } from 'resend';

const sender = process.env.RESEND_FROM_EMAIL || 'Blessed Path Staff Suite <management@blessedpathholdings.com>';

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
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
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937">
      <h2>${escapeHtml(heading)}</h2>
      <p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(body)}</p>
      <p><a href="${actionUrl}" style="display:inline-block;padding:12px 18px;background:#6d45e8;color:#fff;text-decoration:none;border-radius:8px">${escapeHtml(actionLabel)}</a></p>
      <p style="font-size:12px;color:#6b7280">You received this because you are a Blessed Path Staff Suite team member.</p>
    </div>`,
  });

  return { sent: !error, error: error?.message };
}
