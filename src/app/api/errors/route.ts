import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordError } from '@/lib/error-log';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/** POST /api/errors — browser error reports (from ErrorReporter / error pages). */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(`errors:${clientIp(request)}`, 20, 60);
  if (limited) return limited;

  const body = await request.json().catch(() => null) as { message?: unknown; stack?: unknown; url?: unknown; digest?: unknown } | null;
  if (!body || typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await recordError({
    source: 'browser',
    message: body.message,
    stack: typeof body.stack === 'string' ? body.stack : null,
    url: typeof body.url === 'string' ? body.url : null,
    digest: typeof body.digest === 'string' ? body.digest : null,
    userId: user?.id ?? null,
    userAgent: request.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true });
}
