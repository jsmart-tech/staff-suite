/**
 * Detects a file's real type from its first bytes (magic numbers), ignoring
 * the name and the browser-reported type. Used before upload (as a hint) and
 * after upload by verify-upload (as the authoritative check).
 * Needs at least the first 12 bytes; callers read 16.
 */
export function detectMimeFromBytes(buf: Uint8Array): string | null {
  if (buf.length < 4) return null;
  const ascii = (start: number, end: number) => String.fromCharCode(...buf.subarray(start, end));

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)) return 'image/tiff';
  if (ascii(0, 4) === '%PDF') return 'application/pdf';
  // ZIP container (docx, xlsx, pptx, odt, …) — allowed only for Office extensions.
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'application/zip';

  if (buf.length >= 12 && ascii(0, 4) === 'RIFF') {
    const kind = ascii(8, 12);
    if (kind === 'WEBP') return 'image/webp';
    if (kind === 'WAVE') return 'audio/wav';
    if (kind === 'AVI ') return 'video/x-msvideo';
    return null;
  }

  // ISO base media (MP4, MOV, M4A, HEIC, AVIF, 3GP): "ftyp" + brand at byte 4.
  if (buf.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif';
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return 'image/heic';
    if (brand === 'heif' || brand === 'mif1' || brand === 'msf1') return 'image/heif';
    if (brand.startsWith('M4A') || brand.startsWith('M4B')) return 'audio/mp4';
    if (brand === 'qt  ') return 'video/quicktime';
    if (brand.startsWith('3g')) return 'video/3gpp';
    return 'video/mp4'; // isom, iso2, mp41, mp42, avc1, dash, M4V, …
  }

  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 4) === 'fLaC') return 'audio/flac';
  // Matroska / WebM
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  // MP3: ID3 tag, or an MPEG audio frame sync (11 set bits)
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio/mpeg';

  return null;
}
