'use client';

import { useEffect, useState } from 'react';
export default function GenerationSkeleton({
  kind = 'article',
}: {
  kind?: 'article' | 'cards' | 'exam' | 'map';
}) {
  const [statusIndex, setStatusIndex] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const timer = window.setInterval(
      () => setStatusIndex(current => (current + 1) % 3),
      2500,
    );
    return () => window.clearInterval(timer);
  }, []);
  const statuses = [
    'Condensing the syllabus before it humbles you...',
    'Extracting actual signal from the noise...',
    'Building active recall traps...',
  ];
  return (
    <div role="status" aria-live="polite" className="generation-skeleton space-y-5 p-6">
      <p className="text-sm font-medium text-muted-foreground">
        {statuses[statusIndex]}
      </p>
      {kind === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="generation-shimmer content-skeleton-card" />
          <div className="generation-shimmer content-skeleton-card" />
        </div>
      ) : kind === 'exam' ? (
        <div className="space-y-4">
          <div className="generation-shimmer content-skeleton-heading w-2/5" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-border p-4">
              <div className="generation-shimmer content-skeleton-line w-3/4" />
              <div className="generation-shimmer content-skeleton-line w-full" />
              <div className="generation-shimmer content-skeleton-line w-5/6" />
            </div>
          ))}
        </div>
      ) : kind === 'map' ? (
        <div className="relative min-h-[360px] overflow-hidden rounded-xl border border-border">
          {[
            ['left-8 top-8', 'w-44'],
            ['right-10 top-16', 'w-52'],
            ['left-1/2 top-1/2 -translate-x-1/2', 'w-48'],
            ['left-12 bottom-10', 'w-40'],
            ['right-8 bottom-8', 'w-44'],
          ].map(([position, width], index) => (
            <div
              key={index}
              className={`generation-shimmer absolute h-16 ${position} ${width} rounded-lg`}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="generation-shimmer content-skeleton-heading" />
          <div className="space-y-2">
            <div className="generation-shimmer content-skeleton-line" />
            <div className="generation-shimmer content-skeleton-line" />
            <div className="generation-shimmer content-skeleton-line w-4/5" />
          </div>
          <div className="generation-shimmer content-skeleton-card" />
        </>
      )}
    </div>
  );
}
