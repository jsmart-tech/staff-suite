'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

/** Last-resort error screen when the root layout itself fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, { digest: error.digest }); }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#111218', color: '#f0f2f8', fontFamily: 'system-ui, sans-serif' }}>
        <div role="alert" style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 20 }}>Staff Suite ran into a problem</h1>
          <p style={{ color: '#c8c0a8', fontSize: 14 }}>The problem has been recorded for the admins. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: '10px 20px', borderRadius: 12, border: 'none', background: '#f1958d', color: '#1f1414', fontWeight: 600, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
