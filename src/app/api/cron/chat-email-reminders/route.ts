import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDueReminders } from '@/lib/chat-reminders';

export const runtime = 'nodejs';

function secretMatches(provided: string | null | undefined, secret: string) {
  if (!provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Fallback sender for any due reminders a QStash job missed. */
export async function GET(request: NextRequest) {
  const secret = process.env.CHAT_REMINDER_CRON_SECRET;
  const providedSecret = request.headers.get('x-cron-secret')
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secret) {
    return NextResponse.json({ error: 'Reminder scheduler is not configured.' }, { status: 503 });
  }
  if (!secretMatches(providedSecret, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: due, error } = await admin.from('chat_email_notifications')
    .select('id')
    .lte('due_at', new Date().toISOString())
    .is('seen_at', null)
    .is('sent_at', null)
    .order('due_at')
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const { sent, failed } = await sendDueReminders(admin, (due || []).map(row => row.id));
    return NextResponse.json({ processed: sent, failed }, { status: failed ? 502 : 200 });
  } catch (sendError) {
    return NextResponse.json({ error: sendError instanceof Error ? sendError.message : 'Unexpected error' }, { status: 500 });
  }
}
