import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { r2, r2Bucket } from '@/lib/r2';
import { attachmentUrlFor } from '@/lib/attachments';
import { detectMimeFromBytes } from '@/lib/file-types';
import { rateLimit } from '@/lib/rate-limit';

const maxSize = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // At most 60 uploads per user per 10 minutes.
  const limited = await rateLimit(`upload:${user.id}`, 60, 600);
  if (limited) return limited;

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
