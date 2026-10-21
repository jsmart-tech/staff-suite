import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { r2, r2Bucket } from '@/lib/r2';
import { createNotifications } from '@/lib/notifications';
import { rateLimit } from '@/lib/rate-limit';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // At most 10 profile photos per user per hour.
  const limited = await rateLimit(`avatar:${user.id}`, 10, 3600);
  if (limited) return limited;

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Image file is required.' }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: 'Use JPG, PNG, or WebP images.' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Profile images must be 5 MB or smaller.' }, { status: 400 });

  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  // Include a timestamp so each upload is a NEW R2 object with a distinct URL.
  // This is the correct approach for immutable caching: old URL stays cached
  // (harmless — object still exists in R2), new URL is fetched fresh.
  // The old ?v=Date.now() query-string cache-buster is NOT equivalent because
  // it re-used the same R2 key and CDN edges cache by path only (query strings
  // are often ignored). A new key is the only guarantee.
  const key = `avatars/${user.id}/${Date.now()}.${extension}`;
  await r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type }));
  const cdnBase = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/$/, '');
  const avatarUrl = cdnBase ? `${cdnBase}/${key}` : `/api/files/${key}`;
  const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: admins } = await createAdminClient().from('profiles').select('id').eq('role', 'admin');
  try {
    await createNotifications({
      actorId: user.id,
      recipientIds: (admins || []).map(admin => admin.id),
      type: 'profile_updated',
      title: 'Profile photo updated',
      body: 'A team member updated their profile photo.',
      href: '/dashboard/admin/staff',
      entityType: 'profile',
      entityId: user.id,
      eventKey: `profile-avatar:${user.id}:${avatarUrl}`,
    });
  } catch (notificationError) {
    console.error('Unable to create profile notification:', notificationError);
  }
  return NextResponse.json({ avatarUrl });
}
