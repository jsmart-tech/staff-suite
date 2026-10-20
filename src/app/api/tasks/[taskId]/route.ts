import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { sendNotificationEmails, getSiteUrl } from '@/lib/email';
import { createNotifications } from '@/lib/notifications';
import { isIsoDate } from '@/lib/utils';

const TASK_STATUSES = new Set(['in_progress', 'completed', 'blocked']);

/** Maps errors raised by the time-tracking SQL functions to HTTP responses. */
function rpcError(error: { code?: string; message: string }) {
  const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
  return NextResponse.json({ error: error.message }, { status });
}

/**
 * PATCH /api/tasks/[taskId]
 *
 * Employees update their own tasks. `{ action: 'start_timer' | 'stop_timer' }`
 * controls the timer; other fields edit the task, and `hours_spent` sets the
 * task's total hours (recorded as a manual time entry on `date_worked`).
 * After a successful update, all admins receive an email notification
 * so they stay informed of task activity without polling.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { taskId } = await context.params;
    if (!taskId) return NextResponse.json({ error: 'Task ID is required.' }, { status: 400 });

    const admin = createAdminClient();

    // Confirm the task belongs to this user
    const { data: task, error: fetchError } = await admin
      .from('tasks')
      .select('id, title, user_id, status, hours_spent, date_worked, is_timer_running')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    if (task.user_id !== user.id) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;

    // Timer start/stop: the database records the time (see start_task_timer /
    // stop_task_timer), so elapsed hours never come from the browser.
    if (body.action === 'start_timer' || body.action === 'stop_timer') {
      const { data: updated, error } = await supabase.rpc(body.action === 'start_timer' ? 'start_task_timer' : 'stop_task_timer', { p_task_id: taskId });
      if (error) return rpcError(error);
      if (task.is_timer_running !== (body.action === 'start_timer')) {
        await notifyAdmins({ admin, user, task, patch: { is_timer_running: body.action === 'start_timer' } });
      }
      return NextResponse.json({ task: updated });
    }

    // Field edits. Timer columns are not editable here, and hours go through
    // set_task_hours, which validates them and records a 'manual' time entry.
    const patch: Record<string, unknown> = {};
    if ('title' in body) {
      if (typeof body.title !== 'string' || !body.title.trim()) return NextResponse.json({ error: 'Task title is required.' }, { status: 400 });
      patch.title = body.title.trim();
    }
    if ('description' in body) patch.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
    if ('status' in body) {
      if (!TASK_STATUSES.has(String(body.status))) return NextResponse.json({ error: 'Invalid task status.' }, { status: 400 });
      patch.status = body.status;
    }
    for (const key of ['date_worked', 'start_date', 'due_date'] as const) {
      if (!(key in body)) continue;
      if (key === 'due_date' && !body[key]) { patch[key] = null; continue; }
      if (!isIsoDate(body[key])) return NextResponse.json({ error: `Invalid ${key.replace('_', ' ')}.` }, { status: 400 });
      patch[key] = body[key];
    }

    const changesHours = 'hours_spent' in body && Number(body.hours_spent) !== Number(task.hours_spent);
    if (!changesHours && Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    // Hours first: if they're rejected, nothing else is changed.
    if (changesHours) {
      const total = Number(body.hours_spent);
      if (!Number.isFinite(total)) return NextResponse.json({ error: 'Hours must be a number.' }, { status: 400 });
      const { error } = await supabase.rpc('set_task_hours', {
        p_task_id: taskId,
        p_total: total,
        p_work_date: (patch.date_worked as string | undefined) ?? task.date_worked,
      });
      if (error) return rpcError(error);
      patch.hours_spent = total; // for the admin notification only
    }

    const fieldPatch = { ...patch };
    delete fieldPatch.hours_spent; // already saved by set_task_hours
    const { data: updated, error: updateError } = Object.keys(fieldPatch).length > 0
      ? await admin.from('tasks').update(fieldPatch).eq('id', taskId).select().single()
      : await admin.from('tasks').select().eq('id', taskId).single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    // Notify all admins about the task change before completing the request.
    await notifyAdmins({ admin, user, task, patch });

    return NextResponse.json({ task: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[taskId]
 *
 * Employees delete their own tasks. Validates ownership before removal.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { taskId } = await context.params;
    if (!taskId) return NextResponse.json({ error: 'Task ID is required.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: task } = await admin.from('tasks').select('user_id').eq('id', taskId).single();
    if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    if (task.user_id !== user.id) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const { error } = await admin.from('tasks').delete().eq('id', taskId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}

async function notifyAdmins(opts: {
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;
  user: { id: string };
  task: { id: string; title: string; status: string };
  patch: Record<string, unknown>;
}) {
  try {
    const { admin, user, task, patch } = opts;

    // Fetch employee name and all admin emails in parallel
    const [{ data: employee }, { data: admins }] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', user.id).single(),
      admin.from('profiles').select('id, email, full_name').eq('role', 'admin'),
    ]);

    if (!admins || admins.length === 0) return;

    const employeeName = employee?.full_name || 'A team member';

    // Build a human-readable description of the change
    const changes: string[] = [];
    if ('status' in patch) changes.push(`Status → ${String(patch.status).replace('_', ' ')}`);
    if ('hours_spent' in patch) changes.push(`Hours → ${Number(patch.hours_spent).toFixed(2)}h`);
    if ('title' in patch) changes.push(`Title → ${String(patch.title)}`);
    if ('description' in patch) changes.push('Description updated');
    if ('date_worked' in patch) changes.push(`Work date → ${String(patch.date_worked)}`);
    if ('is_timer_running' in patch) {
      changes.push(patch.is_timer_running ? 'Timer started' : 'Timer stopped');
    }
    if ('timer_start_time' in patch && !('is_timer_running' in patch)) changes.push('Timer details updated');
    if (changes.length === 0) return; // Nothing worth notifying about

    await createNotifications({
      actorId: user.id,
      recipientIds: admins.map(adminProfile => adminProfile.id),
      type: 'task_updated',
      title: `Task updated: ${task.title}`,
      body: `${employeeName} updated this task: ${changes.join(', ')}`,
      href: '/dashboard/admin/tasks',
      entityType: 'task',
      entityId: task.id,
      eventKey: `task-updated:${task.id}:${new Date().toISOString()}`,
    });

    const site = getSiteUrl();
    const notifications = admins.map((adminProfile) => ({
      to: adminProfile.email,
      subject: `Task update: "${task.title}" by ${employeeName}`,
      heading: 'A task was updated',
      body: `${employeeName} made changes to the task "${task.title}":\n\n${changes.join('\n')}`,
      actionUrl: `${site}/dashboard/admin/tasks`,
      actionLabel: 'View all tasks',
    }));

    await sendNotificationEmails(notifications);
  } catch {
    // Never throw — this is a background notification
  }
}
