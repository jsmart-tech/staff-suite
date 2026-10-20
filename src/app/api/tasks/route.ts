import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl, sendNotificationEmail } from '@/lib/email';
import { createNotifications } from '@/lib/notifications';
import { isIsoDate, businessToday } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase.from('profiles').select('role, full_name, email').eq('id', user.id).single();
    if (!caller) return NextResponse.json({ error: 'Profile not found.' }, { status: 403 });

    const payload = await request.json();
    const { user_id, title, description, status, hours_spent, date_worked, start_date, due_date } = payload;
    if (!user_id || !title?.trim()) return NextResponse.json({ error: 'Assignee and task title are required.' }, { status: 400 });
    if (caller?.role !== 'admin' && user_id !== user.id) return NextResponse.json({ error: 'You can only create tasks for yourself.' }, { status: 403 });

    const admin = createAdminClient();
    const { data: assignee } = await admin.from('profiles').select('email, full_name').eq('id', user_id).single();
    if (!assignee) return NextResponse.json({ error: 'Selected staff member was not found.' }, { status: 404 });

    const workDate = isIsoDate(date_worked) ? date_worked : businessToday();
    if (status && !['in_progress', 'completed', 'blocked'].includes(status)) return NextResponse.json({ error: 'Invalid task status.' }, { status: 400 });
    if ((start_date && !isIsoDate(start_date)) || (due_date && !isIsoDate(due_date))) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
    const initialHours = Number(hours_spent) || 0;
    if (initialHours < 0) return NextResponse.json({ error: 'Hours cannot be negative.' }, { status: 400 });

    // Hours always start at 0; any initial hours are recorded below through
    // set_task_hours so they get the same checks and an audit entry.
    const inserted = await admin.from('tasks').insert({
      user_id, title: title.trim(), description: description?.trim() || null,
      status: status || 'in_progress', hours_spent: 0,
      date_worked: workDate, start_date: start_date || workDate, due_date: due_date || null, is_timer_running: false,
    }).select().single();
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 400 });
    let task = inserted.data;

    if (initialHours > 0) {
      const hoursResult = await supabase.rpc('set_task_hours', { p_task_id: task.id, p_total: initialHours, p_work_date: workDate });
      if (hoursResult.error) {
        await admin.from('tasks').delete().eq('id', task.id);
        return NextResponse.json({ error: hoursResult.error.message }, { status: 400 });
      }
      task = hoursResult.data;
    }

    try {
      const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
      await createNotifications({
        actorId: user.id,
        recipientIds: caller?.role === 'admin' ? [user_id] : (admins || []).map(adminProfile => adminProfile.id),
        type: caller?.role === 'admin' ? 'task_assigned' : 'task_created',
        title: caller?.role === 'admin' ? 'New task assigned' : 'New task created',
        body: caller?.role === 'admin' ? `${caller.full_name || 'A team member'} assigned you: ${title.trim()}` : `${caller.full_name || 'A team member'} created: ${title.trim()}`,
        href: caller?.role === 'admin' ? '/dashboard/employee/tasks' : '/dashboard/admin/tasks',
        entityType: 'task',
        entityId: task.id,
        eventKey: `${caller?.role === 'admin' ? 'task-assigned' : 'task-created'}:${task.id}`,
      });
    } catch (notificationError) {
      console.error('Unable to create task notification:', notificationError);
    }

    const site = getSiteUrl();
    const email = caller?.role === 'admin' ? await sendNotificationEmail({
      to: assignee.email,
      subject: `New task assigned: ${title.trim()}`,
      heading: 'You have a new task',
      body: `${caller.full_name || 'An administrator'} assigned you: ${title.trim()}${description?.trim() ? `\n\n${description.trim()}` : ''}`,
      actionUrl: `${site}/dashboard/employee/tasks`,
      actionLabel: 'View task',
    }) : { sent: false, error: undefined };

    return NextResponse.json({ task, emailSent: email.sent, emailError: email.error });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 });
  }
}
