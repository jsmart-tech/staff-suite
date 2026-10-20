import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/settings
 * Returns current app_settings row. Available to any authenticated user
 * (so the settings page can display current values).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

/**
 * POST /api/settings
 * Updates app_settings. ADMIN ONLY.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Server-side role check — cannot be spoofed from the client
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { company_name?: unknown; work_hours_per_day?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const companyName = typeof body.company_name === 'string' ? body.company_name.trim() : '';
  const workHours = Number(body.work_hours_per_day);
  if (!companyName || companyName.length > 100) return NextResponse.json({ error: 'Company name is required (up to 100 characters).' }, { status: 400 });
  if (!Number.isFinite(workHours) || workHours < 1 || workHours > 24) return NextResponse.json({ error: 'Work hours per day must be between 1 and 24.' }, { status: 400 });

  // Only these fields are editable. Currency and time zone are fixed
  // (USD, US Eastern) because payroll and date logic depend on them.
  const admin = createAdminClient();
  const { error } = await admin
    .from('app_settings')
    .upsert({
      id: 1,
      company_name: companyName,
      work_hours_per_day: workHours,
      currency: 'USD',
      timezone: 'America/New_York',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
