/**
 * Builds the URL stored on a message row for a verified attachment.
 *
 * Channel files (chat/…) are served by the CDN when one is configured.
 * Direct-message files (dm/…) are always served through /api/files, which
 * checks conversation membership — the public CDN never serves them.
 */
export function attachmentUrlFor(publicKey: string): string {
  const cdnBase = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/$/, '');
  if (cdnBase && publicKey.startsWith('chat/')) return `${cdnBase}/${publicKey}`;
  return `/api/files/${publicKey}`;
}

/** Extracts the R2 object key from an attachment URL sent by the client. */
export function publicKeyFromAttachmentUrl(attachmentUrl: string, requestUrl: string): string | null {
  try {
    return new URL(attachmentUrl, requestUrl).pathname
      .replace(/^\//, '')
      .replace(/^api\/files\//, '');
  } catch {
    return null;
  }
}
