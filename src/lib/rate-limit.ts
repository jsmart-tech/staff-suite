import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Fixed-window rate limit backed by the database (consume_rate_limit).
 * Returns a 429 response when the caller is over the limit, otherwise null.
 * If the limiter itself fails, the request is allowed (logged), so a database
 * hiccup never locks everyone out.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<NextResponse | null> {
  try {
    const { data, error } = await createAdminClient().rpc('consume_rate_limit', {
      p_key: key, p_limit: limit, p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('Rate limiter unavailable:', error.message);
      return null;
    }
    if (data === false) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(windowSeconds) } },
      );
    }
    return null;
  } catch (error) {
    console.error('Rate limiter unavailable:', error);
    return null;
  }
}

/** The caller's IP as seen by Vercel (for limits on signed-out requests). */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}
