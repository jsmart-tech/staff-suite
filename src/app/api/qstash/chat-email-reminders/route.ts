import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { secondsUntilDue, sendDueReminders } from '@/lib/chat-reminders';
import { scheduleChatReminder } from '@/lib/qstash';

export const runtime = 'nodejs';

async function handler(request: NextRequest) {
  const { notificationId } = await request.json().catch(() => ({})) as { notificationId?: string };
  if (!notificationId) return NextResponse.json({ error: 'notificationId is required.' }, { status: 400 });

  const admin = createAdminClient();
  try {
    const { sent, failed } = await sendDueReminders(admin, [notificationId]);
    // A failed send returns 5xx so QStash retries it.
    if (failed) return NextResponse.json({ error: 'Reminder email failed.' }, { status: 502 });
    if (sent) return NextResponse.json({ processed: 1 });

    // Not due yet: newer messages pushed the reminder back. Check again then.
    const remaining = await secondsUntilDue(admin, notificationId);
    if (remaining !== null) {
      const scheduled = await scheduleChatReminder(notificationId, remaining);
      if (scheduled.error) return NextResponse.json({ error: scheduled.error }, { status: 502 });
      return NextResponse.json({ processed: 0, rescheduledInSeconds: Math.ceil(remaining) });
    }
    return NextResponse.json({ processed: 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
