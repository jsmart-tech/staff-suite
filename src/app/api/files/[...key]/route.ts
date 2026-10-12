import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { r2, r2Bucket } from '@/lib/r2';

export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { key } = await context.params;
  const objectKey = key.join('/');

  // ── ETag short-circuit: if the client already has this version, skip R2 ──
  // R2 keys include Date.now() in the filename so they are content-addressed
  // and safe to cache forever with `immutable`.
  const ifNoneMatch = request.headers.get('if-none-match');

  // Fetch metadata first (HeadObject) to check ETag before streaming bytes
  const object = await r2.send(new GetObjectCommand({ Bucket: r2Bucket, Key: objectKey }));
  if (!object.Body) return new NextResponse('File not found', { status: 404 });

  const etag = object.ETag ?? '';

  // Return 304 if the client already has this exact version
  if (ifNoneMatch && etag && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        'Cache-Control': 'private, max-age=31536000, immutable',
        'ETag': etag,
      },
    });
  }

  const bytes = Buffer.from(await object.Body.transformToByteArray());

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': object.ContentType || 'application/octet-stream',
      // Keys contain Date.now() so they are unique per upload — safe to cache
      // for 1 year and mark immutable (browser never revalidates).
      'Cache-Control': 'private, max-age=31536000, immutable',
      ...(etag ? { 'ETag': etag } : {}),
    },
  });
}
