import { createAdminClient } from '@/lib/supabase/admin';
import { getSiteUrl, sendNotificationEmails } from '@/lib/email';

export interface ErrorReport {
  source: 'browser' | 'server';
  message: string;
  stack?: string | null;
  url?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  digest?: string | null;
}

const clip = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);

/**
 * Saves an error to app_errors (shown on Audit Logs) and emails admins at most
 * once an hour so a burst of errors becomes one alert. Never throws.
 */
export async function recordError(report: ErrorReport) {
  try {
    const admin = createAdminClient();
    await admin.from('app_errors').insert({
      source: report.source,
      message: clip(report.message, 2000) || 'Unknown error',
      stack: clip(report.stack, 8000),
      url: clip(report.url, 1000),
      user_id: report.userId ?? null,
      user_agent: clip(report.userAgent, 500),
      digest: clip(report.digest, 200),
    });

    const { data: alertAllowed } = await admin.rpc('consume_rate_limit', {
      p_key: 'error-alert-email', p_limit: 1, p_window_seconds: 3600,
    });
    if (alertAllowed !== true) return;

    const { data: admins } = await admin.from('profiles').select('email').eq('role', 'admin');
    await sendNotificationEmails((admins || []).map(({ email }) => ({
      to: email,
      subject: 'Staff Suite: an error was recorded',
      heading: 'Something went wrong in Staff Suite',
      body: `A ${report.source} error was recorded:\n\n${clip(report.message, 300)}\n\n`
        + `Page: ${report.url || 'unknown'}\n\n`
        + 'You get at most one of these emails per hour. See Audit Logs → System errors for every error.',
      actionUrl: `${getSiteUrl()}/dashboard/admin/logs`,
      actionLabel: 'View errors',
    })));
  } catch (error) {
    console.error('Could not record error:', error);
  }
}
