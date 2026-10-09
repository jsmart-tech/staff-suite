import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotifications } from '@/lib/notifications';
import { sendNotificationEmail, getSiteUrl } from '@/lib/email';

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { taskId } = await context.params;
  const { data, error } = await supabase.from('task_comments').select('*, profiles(full_name, role)').eq('task_id', taskId).order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ comments: data || [] });
}

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: caller } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();
  if (caller?.role !== 'admin') return NextResponse.json({ error: 'Only admins can comment on tasks.' }, { status: 403 });
  const { taskId } = await context.params;
  const { body } = await request.json() as { body?: string };
  if (!body?.trim()) return NextResponse.json({ error: 'Comment is required.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: task } = await admin.from('tasks').select('id, title, user_id').eq('id', taskId).single();
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  const { data: comment, error } = await admin.from('task_comments').insert({ task_id: taskId, author_id: user.id, body: body.trim() }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: recipient } = await admin.from('profiles').select('email, full_name').eq('id', task.user_id).single();
  await createNotifications({ actorId: user.id, recipientIds: [task.user_id], type: 'task_comment', title: `Admin commented on your task: ${task.title}`, body: body.trim(), href: '/dashboard/employee/tasks', entityType: 'task', entityId: task.id, eventKey: `task-comment:${comment.id}` });
  if (recipient?.email) await sendNotificationEmail({ to: recipient.email, subject: `New comment on your task: ${task.title}`, heading: 'New task comment', body: `${caller.full_name || 'An admin'} commented on “${task.title}”:\n\n${body.trim()}`, actionUrl: `${getSiteUrl()}/dashboard/employee/tasks`, actionLabel: 'View task' });
  return NextResponse.json({ comment }, { status: 201 });
}
