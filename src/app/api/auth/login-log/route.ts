import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';

/**
 * POST /api/auth/login-log — records a sign-in for the audit log.
 * Written by the server (users can't insert or fake log rows) with the
 * caller's IP address as seen by Vercel.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Stops one account flooding the audit log.
  const limited = await rateLimit(`login-log:${user.id}`, 30, 3600);
  if (limited) return limited;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || null;
  const { error } = await createAdminClient().from('login_logs').insert({ user_id: user.id, ip_address: ip });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
