/**
 * Paths that work without a signed-in user. Everything else redirects to
 * /login (pages) or returns 401 (API) in src/proxy.ts.
 */
export function isPublicPath(pathname: string): boolean {
  return pathname === '/'
    || pathname.startsWith('/auth/')    // /auth/callback — invite/reset token exchange
    || pathname === '/accept-invite'
    || pathname === '/reset-password'   // invite/recovery password-set pages
    || pathname === '/api/errors'       // error reports (rate-limited), also from the login page
    // Called by QStash / schedulers, not signed-in users. These routes check
    // the QStash signature or the cron secret themselves.
    || pathname.startsWith('/api/qstash/')
    || pathname.startsWith('/api/cron/');
}
