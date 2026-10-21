import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { backupDatabase, cleanStagingUploads, pruneOldRecords } from '@/lib/maintenance';
import { recordError } from '@/lib/error-log';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Nightly maintenance: database backup to R2, removal of unverified uploads,
 * and pruning of old rate-limit/error records. Each step runs even if another
 * fails; any failure is recorded (and emailed to admins via the error log).
 */
async function runDailyJobs() {
  const results: Record<string, unknown> = {};
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['backup', backupDatabase],
    ['stagingCleanup', cleanStagingUploads],
    ['prune', pruneOldRecords],
  ];
  let failed = false;
  for (const [name, step] of steps) {
    try {
      results[name] = (await step()) ?? 'ok';
    } catch (error) {
      failed = true;
      results[name] = { error: error instanceof Error ? error.message : String(error) };
      await recordError({ source: 'server', message: `Daily job "${name}" failed: ${results[name] && (results[name] as { error: string }).error}`, url: '/api/cron/daily' });
    }
  }
  return NextResponse.json(results, { status: failed ? 500 : 200 });
}

// Scheduled by QStash (signed request).
export const POST = verifySignatureAppRouter(async () => runDailyJobs());

// Manual run: GET with the cron secret (x-cron-secret or Bearer header).
export async function GET(request: NextRequest) {
  const secret = process.env.CHAT_REMINDER_CRON_SECRET;
  const provided = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secret) return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  const ok = !!provided && provided.length === secret.length && timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return runDailyJobs();
}
