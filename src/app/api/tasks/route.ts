import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl, sendNotificationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();
    if (caller?.role !== 'admin') return NextResponse.json({ error: 'Only admins can assign tasks.' }, { status: 403 });

    const payload = await request.json();
    const { user_id, title, description, status, hours_spent, date_worked, start_date, due_date } = payload;
    if (!user_id || !title?.trim()) return NextResponse.json({ error: 'Assignee and task title are required.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: assignee } = await admin.from('profiles').select('email, full_name').eq('id', user_id).single();
    if (!assignee) return NextResponse.json({ error: 'Selected staff member was not found.' }, { status: 404 });

    const { data: task, error } = await admin.from('tasks').insert({
      user_id, title: title.trim(), description: description?.trim() || null,
      status: status || 'in_progress', hours_spent: Number(hours_spent) || 0,
      date_worked, start_date: start_date || date_worked, due_date: due_date || null, is_timer_running: false,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const site = getSiteUrl();
    const email = await sendNotificationEmail({
      to: assignee.email,
      subject: `New task assigned: ${title.trim()}`,
      heading: 'You have a new task',
      body: `${caller.full_name || 'An administrator'} assigned you: ${title.trim()}${description?.trim() ? `\n\n${description.trim()}` : ''}`,
      actionUrl: `${site}/dashboard/employee/tasks`,
      actionLabel: 'View task',
    });

    return NextResponse.json({ task, emailSent: email.sent, emailError: email.error });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
