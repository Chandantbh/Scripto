'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function RootGlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fafafa', color: '#18181b' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
          <div style={{ maxWidth: '420px', textAlign: 'center', border: '1px solid #e4e4e7', borderRadius: '12px', background: 'white', padding: '32px' }}>
            <AlertTriangle aria-hidden="true" style={{ width: 28, height: 28, margin: '0 auto 16px', color: '#ef4444' }} />
            <h1 style={{ margin: 0, fontSize: '20px' }}>Scripto needs a quick reload</h1>
            <p style={{ color: '#71717a', fontSize: '14px' }}>
              The workspace encountered an unexpected error.
            </p>
            <button
              type="button"
              onClick={() => {
                reset();
                window.location.reload();
              }}
              style={{ marginTop: '16px', border: 0, borderRadius: '8px', background: '#18181b', color: 'white', padding: '10px 16px', cursor: 'pointer' }}
            >
              Reload workspace
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
