'use client';

import { useEffect } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { reportError } from '@/lib/report-error';

/** Shown when a page crashes; the error is recorded for admins. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, { digest: error.digest }); }, [error]);

  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertCircle size={36} style={{ color: 'var(--accent-rose)' }} />
      <h1 className="text-xl font-bold">Something went wrong on this page</h1>
      <p className="max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
        The problem has been recorded for the admins. Try again, and if it keeps happening, let an admin know what you were doing.
      </p>
      <button onClick={reset} className="btn-primary">
        <RotateCcw size={15} /> Try again
      </button>
    </div>
  );
}
