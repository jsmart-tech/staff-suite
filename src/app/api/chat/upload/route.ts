import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { r2, r2Bucket } from '@/lib/r2';

const maxSize = 20 * 1024 * 1024;

/**
 * Detect MIME type from the first 12 bytes (magic bytes / file signatures).
 * This is server-authoritative — the browser-supplied `file.type` is ignored.
 * Covers the most common image formats used in chat (JPEG, PNG, GIF, WebP,
 * AVIF, HEIC/HEIF, BMP, TIFF).  Everything else falls back to the original
 * browser-supplied type, which is then validated by checking it is not empty.
 */
function detectMimeFromBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  // BMP: 42 4D
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  // TIFF LE: 49 49 2A 00  or BE: 4D 4D 00 2A
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)) return 'image/tiff';
  // AVIF / HEIC / HEIF — all use ISO Base Media File Format (ftyp box at offset 4)
  // ftyp box: bytes 4-7 == 'ftyp'
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif';
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('hevc')) return 'image/heic';
    if (brand.startsWith('heif') || brand.startsWith('mif1')) return 'image/heif';
    // Generic mp4/mov — not an image
    return null;
  }
  // PDF: 25 50 44 46
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';

  return null; // unknown — will fall back to browser-supplied type
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const file = (await request.formData()).get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 });
  if (file.size > maxSize) return NextResponse.json({ error: 'Files over 20 MB must be uploaded to Google Drive, then shared as a link.' }, { status: 413 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // Server-authoritative MIME detection — magic bytes win over browser-supplied type
  const detectedMime = detectMimeFromBytes(buffer);
  const mimeType = detectedMime ?? (file.type || 'application/octet-stream');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `chat/${user.id}/${Date.now()}-${safeName}`;

  await r2.send(new PutObjectCommand({
    Bucket: r2Bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));

  return NextResponse.json({
    url: `/api/files/${key}`,
    name: file.name,
    size: file.size,
    mimeType,        // returned to client so the optimistic bubble knows the type
  });
}
