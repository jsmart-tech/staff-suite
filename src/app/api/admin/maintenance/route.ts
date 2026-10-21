import { Client } from '@upstash/qstash';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { latestBackup } from '@/lib/maintenance';

const SCHEDULE_CRON = 'CRON_TZ=America/New_York 0 3 * * *';

/**
 * Admin-only control for the nightly maintenance job (/api/cron/daily).
 * Runs inside production so the schedule and messages use production's QStash
 * account — the job verifies QStash signatures with production's signing keys.
 *
 * GET  → { schedules }                      current schedule(s)
 * POST { action: 'ensure-schedule' }         create the 03:00 Eastern schedule if missing
 * POST { action: 'run-now' }                 queue the job to run immediately
 */
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Admins only.' }, { status: 403 }) };
  return { userId: user.id };
}

function qstash() {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  return new Client({ token, ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}) });
}

const destination = () => `${getSiteUrl().replace(/\/$/, '')}/api/cron/daily`;

async function dailySchedules(client: Client) {
  return (await client.schedules.list())
    .filter(s => s.destination === destination())
    .map(s => ({ id: s.scheduleId, cron: s.cron, paused: s.isPaused ?? false }));
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const client = qstash();
  if (!client) return NextResponse.json({ error: 'QStash is not configured.' }, { status: 503 });
  const [schedules, lastBackup] = await Promise.all([
    dailySchedules(client),
    latestBackup().catch(() => null),
  ]);
  return NextResponse.json({ destination: destination(), schedules, lastBackup });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const limited = await rateLimit(`maintenance:${auth.userId}`, 10, 3600);
  if (limited) return limited;
  const client = qstash();
  if (!client) return NextResponse.json({ error: 'QStash is not configured.' }, { status: 503 });

  const { action } = await request.json().catch(() => ({})) as { action?: string };
  if (action === 'ensure-schedule') {
    let schedules = await dailySchedules(client);
    if (schedules.length === 0) {
      await client.schedules.create({ destination: destination(), cron: SCHEDULE_CRON, retries: 3 });
      schedules = await dailySchedules(client);
    }
    return NextResponse.json({ schedules });
  }
  if (action === 'run-now') {
    const { messageId } = await client.publishJSON({ url: destination(), body: { trigger: 'manual' } });
    return NextResponse.json({ queued: true, messageId });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
