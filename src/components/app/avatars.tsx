'use client';

import type { ReactNode } from 'react';

export const AVATAR_OPTIONS = [
  ['account', 'Account Photo'],
  ['lofi-girl', 'Lo-Fi Girl'],
  ['lofi-boy', 'Lo-Fi Boy'],
  ['scholar-girl', 'Scholar Girl'],
  ['night-coder-boy', 'Night Coder Boy'],
  ['coffee-girl', 'Coffee Break Girl'],
  ['focus-boy', 'Focus Boy'],
] as const;

export function AvatarGraphic({
  id = 'account',
  imageUrl,
  name,
  className = 'h-10 w-10',
}: {
  id?: string;
  imageUrl?: string;
  name?: string;
  className?: string;
}) {
  if (id === 'account' && imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ? `${name} profile` : 'Profile'}
        className={`${className} rounded-full border border-border object-cover`}
      />
    );
  }

  const illustrated: Record<string, ReactNode> = {
    'lofi-girl': <GirlAvatar headphones />,
    'lofi-boy': <BoyAvatar headphones />,
    'scholar-girl': <GirlAvatar book />,
    'night-coder-boy': <BoyAvatar code />,
    'coffee-girl': <GirlAvatar coffee />,
    'focus-boy': <BoyAvatar focus />,
  };

  if (illustrated[id]) {
    return (
      <span className={`${className} avatar-illustration block overflow-hidden rounded-full border border-foreground/20 bg-secondary`}>
        {illustrated[id]}
      </span>
    );
  }

  const initials = name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return (
    <span className={`${className} grid place-items-center rounded-full border border-border bg-foreground text-xs font-bold text-background`}>
      {initials || 'S'}
    </span>
  );
}

function GirlAvatar({ headphones, book, coffee }: { headphones?: boolean; book?: boolean; coffee?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
      <rect width="40" height="40" rx="20" fill="#111111" />
      <circle cx="20" cy="15" r="8" fill="#F4F4F4" stroke="#111111" strokeWidth="1" />
      <path d="M12 17c0-9 16-9 16 0-3-3-5-5-8-5s-5 2-8 5z" fill="#111111" stroke="#F4F4F4" strokeWidth="1" />
      {headphones && <path d="M10 16v-2c0-8 20-8 20 2" fill="none" stroke="#F4F4F4" strokeWidth="2" />}
      <path d="M10 40c1-10 5-15 10-15s9 5 10 15" fill="#F4F4F4" />
      {book && <path d="M15 29h10v7H15z" fill="#111111" stroke="#111111" />}
      {coffee && <path d="M25 27h7v6h-7zM32 29h3v3h-3" fill="#111111" stroke="#F4F4F4" />}
    </svg>
  );
}

function BoyAvatar({ headphones, code, focus }: { headphones?: boolean; code?: boolean; focus?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
      <rect width="40" height="40" rx="20" fill="#F4F4F4" />
      <circle cx="20" cy="15" r="8" fill="#111111" stroke="#111111" strokeWidth="1" />
      <path d="M12 13c1-7 15-7 16 1-4-2-11-3-16-1z" fill="#111111" />
      {headphones && <path d="M10 16v-2c0-8 20-8 20 2" fill="none" stroke="#111111" strokeWidth="2" />}
      <path d="M10 40c1-10 5-15 10-15s9 5 10 15" fill="#111111" />
      {code && <path d="M14 27l-4 4 4 4M26 27l4 4-4 4M22 25l-4 12" fill="none" stroke="#F4F4F4" strokeWidth="1.5" />}
      {focus && <path d="M14 28h12v8H14zM17 24h6" fill="#F4F4F4" stroke="#111111" />}
    </svg>
  );
}
