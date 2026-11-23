import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export default function SpotlightSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('hover-column', className)}>
      {children}
    </div>
  );
}
