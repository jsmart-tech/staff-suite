import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { sendNotificationEmails, getSiteUrl } from '@/lib/email';

/**
 * PATCH /api/tasks/[taskId]
 *
 * Employees update their own tasks (status, hours, timer).
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
      .select('id, title, user_id, status, hours_spent, is_timer_running')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    if (task.user_id !== user.id) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;

    // Safely whitelist only updatable fields for employees
    const allowed = ['title', 'description', 'status', 'hours_spent', 'date_worked', 'is_timer_running', 'timer_start_time'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await admin
      .from('tasks')
      .update(patch)
      .eq('id', taskId)
      .select()
      .single();

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
      admin.from('profiles').select('email, full_name').eq('role', 'admin'),
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
