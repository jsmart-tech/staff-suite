import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { r2, r2Bucket } from '@/lib/r2';

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { key } = await context.params;
  const object = await r2.send(new GetObjectCommand({ Bucket: r2Bucket, Key: key.join('/') }));
  if (!object.Body) return new NextResponse('File not found', { status: 404 });
  return new NextResponse(Buffer.from(await object.Body.transformToByteArray()), {
    headers: {
      'Content-Type': object.ContentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
      ...(object.ETag ? { ETag: object.ETag } : {}),
    },
  });
}
