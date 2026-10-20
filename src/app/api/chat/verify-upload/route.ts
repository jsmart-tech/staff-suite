import { GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { r2, r2Bucket } from '@/lib/r2';
import { detectMimeFromBytes } from '@/lib/file-types';

/**
 * POST /api/chat/verify-upload
 *
 * Called by the client immediately after the presigned XHR PUT to R2 succeeds.
 * Reads the first 16 bytes of the stored object directly from R2, re-runs
 * magic-byte MIME detection, and:
 *
 *  - Returns { mimeType, ok: true }  — client uses this authoritative value
 *    instead of the browser- or pre-upload-detected type.
 *
 *  - Returns { ok: false, error }    — if the real content type is not in the
 *    allowlist (e.g. someone PUT a binary executable disguised as a JPEG).
 *    The stored R2 object is deleted before returning so no bad file lingers.
 *
 * The `key` must be the staging copy of `publicKey` and belong to the
 * authenticated user (enforced by prefix check).
 */

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'audio/',
  'video/',
  // Office formats fall through to octet-stream; allowed by filename extension
];

const ALLOWED_OCTET_STREAM_EXTENSIONS = new Set([
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt',
]);

function isMimeAllowed(mime: string | null, fileName: string): boolean {
  if (!mime) {
    // Unknown magic bytes — allow only safe extensions
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return ALLOWED_OCTET_STREAM_EXTENSIONS.has(ext);
  }
  // Allow ZIP only when the extension is a known Office format
  if (mime === 'application/zip') {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'].includes(ext);
  }
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { key, publicKey } = await request.json() as { key?: string; publicKey?: string };

  if (!key || typeof key !== 'string' || !publicKey || typeof publicKey !== 'string') {
    return NextResponse.json({ error: 'key and publicKey are required.' }, { status: 400 });
  }

  // Every upload must still be in staging, under the caller's own folder, and
  // must be promoted to exactly the matching public key.
  const ownPrefixes = [`chat/${user.id}/`, `dm/${user.id}/`];
  if (key !== `staging/${publicKey}` ||
      !ownPrefixes.some((prefix) => publicKey.startsWith(prefix)) ||
      publicKey.includes('..')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  // The extension check uses the server-built key (sanitized at upload-url
  // time), not a file name the client could change for this request.
  const fileName = publicKey.split('/').pop() ?? '';

  // Fetch the first 16 bytes from R2 using HTTP Range to avoid downloading the
  // entire file just for magic-byte detection.
  let headBytes: Buffer;
  try {
    const obj = await r2.send(new GetObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      Range: 'bytes=0-15',
    }));
    if (!obj.Body) throw new Error('Empty body');
    headBytes = Buffer.from(await obj.Body.transformToByteArray());
  } catch {
    return NextResponse.json({ error: 'Could not read uploaded file from storage.' }, { status: 502 });
  }

  const detectedMime = detectMimeFromBytes(headBytes);
  const allowed = isMimeAllowed(detectedMime, fileName);

  if (!allowed) {
    // Delete the bad object from R2 so it cannot be served
    try {
      await r2.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }));
    } catch {
      // Best-effort; log and continue with the rejection response
      console.error('verify-upload: failed to delete rejected object', key);
    }
    return NextResponse.json(
      { ok: false, error: 'File type not allowed. Use images, PDFs, Office documents, audio, or video.' },
      { status: 415 },
    );
  }

  // Return the authoritative MIME from real bytes (may differ from the
  // pre-upload detection if the client sent an imperfect header sample).
  const authoritativeMime = detectedMime ?? 'application/octet-stream';
  try {
    await r2.send(new CopyObjectCommand({ Bucket: r2Bucket, CopySource: `${r2Bucket}/${key}`, Key: publicKey, ContentType: authoritativeMime, MetadataDirective: 'REPLACE' }));
    await r2.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }));
    const admin = (await import('@/lib/supabase/admin')).createAdminClient();
    const { error } = await admin.from('verified_uploads').insert({ user_id: user.id, staging_key: key, public_key: publicKey, mime_type: authoritativeMime });
    if (error) throw error;
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not finalize verified upload.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, mimeType: authoritativeMime, publicKey });
}
