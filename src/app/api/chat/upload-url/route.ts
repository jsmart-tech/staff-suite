import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { r2, r2Bucket } from '@/lib/r2';
import { attachmentUrlFor } from '@/lib/attachments';

const maxSize = 20 * 1024 * 1024;

/**
 * Detect MIME type from the first 12 bytes (magic bytes / file signatures).
 * On the presigned-PUT path the client sends the first 16 raw bytes as a
 * base-64 string in `fileHeaderBase64`.  Falls back to the browser-supplied
 * MIME type when that header is missing or unrecognised.
 */
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
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileName, fileSize, browserMime, fileHeaderBase64, scope } = await request.json();
  // Direct-message files live under dm/ so they are never served by the public
  // CDN; /api/files checks conversation membership before returning them.
  const isDirect = scope === 'dm';

  if (!fileName || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'fileName is required.' }, { status: 400 });
  }
  if (typeof fileSize !== 'number' || fileSize <= 0 || fileSize > maxSize) {
    return NextResponse.json(
      { error: 'Files over 20 MB must be uploaded to Google Drive, then shared as a link.' },
      { status: 413 },
    );
  }

  // Detect MIME from first 16 bytes the client sends as base-64
  let mimeType = (typeof browserMime === 'string' && browserMime) ? browserMime : 'application/octet-stream';
  if (typeof fileHeaderBase64 === 'string') {
    try {
      const detected = detectMimeFromBytes(Buffer.from(fileHeaderBase64, 'base64'));
      if (detected) mimeType = detected;
    } catch {
      // ignore — use browser-supplied type
    }
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  // UUID entropy prevents enumeration/collision; the timestamp is retained
  // only as a useful sort hint and is not relied on for secrecy.
  const objectId = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const publicKey = `${isDirect ? 'dm' : 'chat'}/${user.id}/${objectId}`;
  // Keep every upload in staging until verify-upload has checked the stored
  // bytes and finalized the object. This also keeps the presigned PUT/CORS
  // path identical for images and other attachment types.
  const key = `staging/${publicKey}`;

  // Presigned PUT valid for 5 minutes.
  // Browser uploads directly to R2 — Next.js is not in the data path.
  //
  // ContentLength is included in the signature so R2 will reject the upload
  // if the body byte count doesn't match the declared fileSize.  This is the
  // only server-enforceable size guard in a presigned PUT flow — the server
  // never sees the bytes, so it cannot validate them after the fact.
  //
  // The staging object is always stored as application/octet-stream, so a
  // client-chosen type (e.g. text/html) is never attached to unverified bytes.
  // verify-upload sets the real type when it promotes the object.
  const uploadContentType = 'application/octet-stream';
  const presignedUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      ContentType: uploadContentType,
      ContentLength: fileSize,   // ← enforced: R2 rejects PUT if body ≠ this
    }),
    { expiresIn: 300 },
  );

  return NextResponse.json({ presignedUrl, cdnUrl: attachmentUrlFor(publicKey), key, publicKey, mimeType, uploadContentType });
}
