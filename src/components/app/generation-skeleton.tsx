'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function GenerationSkeleton({
  kind = 'article',
}: {
  kind?: 'article' | 'cards';
}) {
  const [statusIndex, setStatusIndex] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const timer = window.setInterval(
      () => setStatusIndex(current => (current + 1) % 3),
      2200,
    );
    return () => window.clearInterval(timer);
  }, []);
  const statuses = [
    'Reading the lore...',
    'Cooking up your notes...',
    'Making sure you actually pass...',
  ];
  return (
    <div role="status" aria-live="polite" className="space-y-5 p-6">
      <p className="skeleton-status text-sm">
        {statuses[statusIndex]}
      </p>
      {kind === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="content-skeleton-card" />
          <Skeleton className="content-skeleton-card" />
        </div>
      ) : (
        <>
          <Skeleton className="content-skeleton-heading" />
          <div className="space-y-2">
            <Skeleton className="content-skeleton-line" />
            <Skeleton className="content-skeleton-line" />
            <Skeleton className="content-skeleton-line w-4/5" />
          </div>
          <Skeleton className="content-skeleton-card" />
        </>
      )}
    </div>
  );
}
