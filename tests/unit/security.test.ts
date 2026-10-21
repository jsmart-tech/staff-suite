import { describe, expect, it } from 'vitest';
import { detectMimeFromBytes } from '@/lib/file-types';
import { safeNextPath } from '@/lib/redirects';
import { publicKeyFromAttachmentUrl } from '@/lib/attachments';

const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map(b => parseInt(b, 16)));
const ascii = (s: string, size = 16) => { const b = new Uint8Array(size); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };

describe('file type detection (from file contents, not names)', () => {
  it.each([
    ['JPEG', hex('ffd8ffe000104a464946000101000001'), 'image/jpeg'],
    ['PNG', hex('89504e470d0a1a0a0000000d49484452'), 'image/png'],
    ['PDF', ascii('%PDF-1.7'), 'application/pdf'],
    ['MP4', hex('00000020667479706973 6f6d00000200'.replace(/ /g, '')), 'video/mp4'],
    ['iPhone MOV', hex('00000014667479707174202000000000'), 'video/quicktime'],
    ['M4A voice note', hex('00000020667479704d34412000000000'), 'audio/mp4'],
    ['HEIC photo', hex('00000018667479706865696300000000'), 'image/heic'],
    ['WAV', ascii('RIFF\x24\x00\x00\x00WAVEfmt '), 'audio/wav'],
    ['WEBP', ascii('RIFF\x24\x00\x00\x00WEBPVP8 '), 'image/webp'],
    ['OGG', ascii('OggS'), 'audio/ogg'],
    ['WebM', hex('1a45dfa3010000000000001f42868101'), 'video/webm'],
    ['MP3', ascii('ID3\x04'), 'audio/mpeg'],
    ['Office (zip)', hex('504b0304140006000800000021000000'), 'application/zip'],
  ])('recognises %s', (_name, bytes, expected) => {
    expect(detectMimeFromBytes(bytes)).toBe(expected);
  });

  it.each([
    ['HTML page', ascii('<html><script>')],
    ['Windows program', hex('4d5a9000030000000400000000000000')],
    ['SVG', ascii('<svg xmlns="http')],
  ])('does not recognise a %s (so it is never treated as safe media)', (_name, bytes) => {
    expect(detectMimeFromBytes(bytes)).toBeNull();
  });
});

describe('login redirect checking', () => {
  it('keeps paths on this site', () => {
    expect(safeNextPath('/dashboard/chat?x=1')).toBe('/dashboard/chat?x=1');
  });
  it.each([null, 'javascript:alert(1)', '//evil.com', '/\\evil.com', 'https://evil.com', '/\t/evil.com', '%2F%2Fevil.com'])(
    'sends %s to /dashboard', (input) => {
      expect(safeNextPath(input)).toBe('/dashboard');
    });
  it('escapes script-breaking characters', () => {
    expect(safeNextPath('/</script><script>alert(1)</script>')).not.toContain('<');
  });
});

describe('attachment keys', () => {
  it('reads the storage key from app and CDN links', () => {
    expect(publicKeyFromAttachmentUrl('/api/files/dm/u1/a.png', 'https://app.test/x')).toBe('dm/u1/a.png');
    expect(publicKeyFromAttachmentUrl('https://cdn.test/chat/u1/a.png', 'https://app.test/x')).toBe('chat/u1/a.png');
  });
});
