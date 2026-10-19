import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { r2, r2Bucket } from '@/lib/r2';

// Only these types are rendered inline; everything else is forced to download
// so an uploaded HTML/SVG/script file can never execute on the app origin.
const INLINE_IMAGE_TYPES = /^image\/(jpeg|png|gif|webp|bmp|tiff|avif|heic|heif)$/i;

export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { key } = await context.params;
  const objectKey = key.join('/');

  // Staging objects have not been verified yet and are never served.
  // Only known prefixes are served; SVG is never served (it can carry script).
  const [prefix] = objectKey.split('/');
  if (!['chat', 'dm', 'avatars'].includes(prefix) || objectKey.includes('..') || /\.svg$/i.test(objectKey)) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Direct-message attachments: only the uploader or a member of a conversation
  // the file was sent in may read it. RLS on direct_messages enforces membership.
  if (prefix === 'dm' && !objectKey.startsWith(`dm/${user.id}/`)) {
    const { data: message } = await supabase
      .from('direct_messages')
      .select('id')
      .eq('attachment_url', `/api/files/${objectKey}`)
      .limit(1)
      .maybeSingle();
    if (!message) return new NextResponse('Not found', { status: 404 });
  }

  const ifNoneMatch = request.headers.get('if-none-match') ?? undefined;

  let object;
  try {
    object = await r2.send(new GetObjectCommand({ Bucket: r2Bucket, Key: objectKey, IfNoneMatch: ifNoneMatch }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: { 'Cache-Control': 'private, max-age=31536000, immutable', ...(ifNoneMatch ? { ETag: ifNoneMatch } : {}) },
      });
    }
    if (status === 404) return new NextResponse('File not found', { status: 404 });
    throw error;
  }
  if (!object.Body) return new NextResponse('File not found', { status: 404 });

  const contentType = object.ContentType || 'application/octet-stream';
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    // Keys are unique per upload, so the browser can cache them for a year.
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
  if (object.ETag) headers.ETag = object.ETag;
  if (object.ContentLength !== undefined) headers['Content-Length'] = String(object.ContentLength);
  if (!INLINE_IMAGE_TYPES.test(contentType)) headers['Content-Disposition'] = 'attachment';

  return new NextResponse(object.Body.transformToWebStream(), { headers });
}
