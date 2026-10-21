import { describe, expect, it } from 'vitest';
import { isPublicPath } from '@/lib/public-paths';

describe('paths reachable without signing in', () => {
  // Regression: QStash calls these with no user session. They were blocked by
  // the proxy, so no unread-message reminder email was ever sent.
  it.each(['/api/qstash/chat-email-reminders', '/api/cron/chat-email-reminders', '/api/cron/daily'])(
    'lets schedulers reach %s', (p) => expect(isPublicPath(p)).toBe(true));

  it.each(['/', '/auth/callback', '/accept-invite', '/reset-password', '/api/errors'])(
    'lets signed-out people reach %s', (p) => expect(isPublicPath(p)).toBe(true));

  it.each(['/dashboard', '/dashboard/admin/staff', '/api/files/chat/x.png', '/api/users/123', '/api/tasks', '/api/settings', '/api/qstashx'])(
    'requires sign-in for %s', (p) => expect(isPublicPath(p)).toBe(false));
});
