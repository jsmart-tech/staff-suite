import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { r2, r2Bucket } from '@/lib/r2';

const maxSize = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const file = (await request.formData()).get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 });
  if (file.size > maxSize) return NextResponse.json({ error: 'Files over 20 MB must be uploaded to Google Drive, then shared as a link.' }, { status: 413 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `chat/${user.id}/${Date.now()}-${safeName}`;
  await r2.send(new PutObjectCommand({ Bucket: r2Bucket, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type || 'application/octet-stream' }));
  return NextResponse.json({ url: `/api/files/${key}`, name: file.name, size: file.size });
}
