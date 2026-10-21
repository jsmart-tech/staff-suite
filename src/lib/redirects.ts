/**
 * Only allow redirects to a path on this site. Rejects absolute URLs,
 * protocol-relative `//evil.com`, backslash tricks and `javascript:` values.
 */
export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/dashboard';
  }
  try {
    const base = 'http://local.invalid';
    const url = new URL(value, base);
    if (url.origin !== base) return '/dashboard';
    return url.pathname + url.search;
  } catch {
    return '/dashboard';
  }
}
