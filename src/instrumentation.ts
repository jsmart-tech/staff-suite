import type { Instrumentation } from 'next';

/** Records uncaught server errors (pages, route handlers, proxy) in app_errors. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recordError } = await import('@/lib/error-log');
  await recordError({
    source: 'server',
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
    url: `${request.method} ${request.path} (${context.routeType}: ${context.routePath})`,
    digest: typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : null,
  });
};
