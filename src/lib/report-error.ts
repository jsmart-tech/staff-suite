'use client';

const sent = new Set<string>();
let count = 0;

/**
 * Sends a browser error to /api/errors (at most 5 per page load, no
 * duplicates). Never throws.
 */
export function reportError(error: unknown, extra: { digest?: string } = {}) {
  try {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const key = `${message}|${extra.digest ?? ''}`;
    if (sent.has(key) || count >= 5) return;
    sent.add(key);
    count++;
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        message,
        stack: error instanceof Error ? error.stack : undefined,
        url: window.location.pathname,
        digest: extra.digest,
      }),
    }).catch(() => undefined);
  } catch {
    // Reporting must never break the page.
  }
}
