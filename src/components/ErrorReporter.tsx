'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

/** Reports uncaught browser errors and rejected promises to the error log. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // Ignore failed <img>/<video> loads (no `error` object) and cross-origin noise.
      if (!event.error || event.message === 'Script error.') return;
      reportError(event.error);
    };
    const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
