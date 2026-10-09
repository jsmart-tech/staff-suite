import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotifications } from '@/lib/notifications';
import { sendNotificationEmail, getSiteUrl } from '@/lib/email';

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { taskId } = await context.params;
  const admin = createAdminClient();
  const { data: task } = await admin.from('tasks').select('user_id').eq('id', taskId).single();
  const { data: caller } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (!task || (task.user_id !== user.id && caller?.role !== 'admin')) return NextResponse.json({ error: 'You cannot view these comments.' }, { status: 403 });
  const { data, error } = await admin.from('task_comments').select('*, profiles(full_name, role)').eq('task_id', taskId).order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ comments: data || [] });
}

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: caller } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();
  const { taskId } = await context.params;
  const { body } = await request.json() as { body?: string };
  if (!body?.trim()) return NextResponse.json({ error: 'Comment is required.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: task } = await admin.from('tasks').select('id, title, user_id').eq('id', taskId).single();
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (caller?.role !== 'admin' && task.user_id !== user.id) return NextResponse.json({ error: 'You cannot comment on this task.' }, { status: 403 });
  const { data: comment, error } = await admin.from('task_comments').insert({ task_id: taskId, author_id: user.id, body: body.trim() }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: admins } = await admin.from('profiles').select('id, email, full_name').eq('role', 'admin');
  const recipients = caller?.role === 'admin' ? [task.user_id] : (admins || []).map(item => item.id);
  await createNotifications({ actorId: user.id, recipientIds: recipients, type: 'task_comment', title: `${caller?.role === 'admin' ? 'Admin commented' : 'User replied'} on your task: ${task.title}`, body: body.trim(), href: '/dashboard/notifications', entityType: 'task', entityId: task.id, eventKey: `task-comment:${comment.id}` });
  const emails = caller?.role === 'admin' ? (await admin.from('profiles').select('email').eq('id', task.user_id).single()).data?.email : (admins || []).map(item => item.email).filter(Boolean);
  const emailList = (Array.isArray(emails) ? emails : emails ? [emails] : []) as string[];
  after(async () => {
    for (const email of emailList) await sendNotificationEmail({ to: email, subject: `New comment on your task: ${task.title}`, heading: 'New task comment', body: `${caller?.full_name || 'A team member'} commented on “${task.title}”:\n\n${body.trim()}`, actionUrl: `${getSiteUrl()}/dashboard/notifications`, actionLabel: 'View notification' });
  });
  return NextResponse.json({ comment }, { status: 201 });
}
