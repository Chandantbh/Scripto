'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">This workspace hit a snag</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something unexpected happened. Reload the workspace to continue studying.
        </p>
        <Button className="mt-6" onClick={() => {
          reset();
          window.location.reload();
        }}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reload workspace
        </Button>
      </div>
    </main>
  );
}
