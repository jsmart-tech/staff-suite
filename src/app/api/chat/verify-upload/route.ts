import { GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { r2, r2Bucket } from '@/lib/r2';

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
 * The `key` must belong to the authenticated user (enforced by prefix check).
 */

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'audio/',
  'video/',
  'text/plain',
  // Office formats fall through to octet-stream; allowed by filename extension
];

const ALLOWED_OCTET_STREAM_EXTENSIONS = new Set([
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt',
]);

function detectMimeFromBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)) return 'image/tiff';
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif';
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('hevc')) return 'image/heic';
    if (brand.startsWith('heif') || brand.startsWith('mif1')) return 'image/heif';
    return null;
  }
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  // ZIP-based container (Office Open XML, ODP, ODS, …)
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'application/zip';
  // MP3
  if ((buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
      (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  // MP4 / MOV
  if (buf.length >= 8 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70)
    return 'video/mp4';
  return null;
}

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

  const { key, publicKey, fileName } = await request.json() as { key?: string; publicKey?: string; fileName?: string };

  if (!key || typeof key !== 'string' || !publicKey || typeof publicKey !== 'string' || !fileName || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'key and fileName are required.' }, { status: 400 });
  }

  // Enforce ownership: the key must start with chat/{user.id}/
  const expectedPrefix = `staging/chat/${user.id}/`;
  if (!key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

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
