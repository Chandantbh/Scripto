import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_REQUESTS_PER_MINUTE = 10;
const MAX_REQUESTS_PER_HOUR = 50;
const MAX_GUEST_REQUESTS_PER_HOUR = 3;
const CLEANUP_INTERVAL_MS = 5 * MINUTE_MS;

type RateWindow = 'minute' | 'hour';

type RateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      window: RateWindow;
      retryAfterSeconds: number;
    };

const requestTimestamps = new Map<string, number[]>();
let lastCleanupAt = 0;

export async function checkAIRateLimit(now = Date.now()): Promise<RateLimitDecision> {
  const { userId } = await auth();
  const requestHeaders = await headers();
  const identity = userId
    ? `user:${userId}`
    : `ip:${getClientIp(requestHeaders) ?? 'unknown'}`;

  cleanupExpiredEntries(now);

  const activeRequests = (requestTimestamps.get(identity) ?? [])
    .filter(timestamp => timestamp > now - HOUR_MS);
  const minuteRequests = activeRequests.filter(timestamp => timestamp > now - MINUTE_MS);
  const hourlyLimit = userId ? MAX_REQUESTS_PER_HOUR : MAX_GUEST_REQUESTS_PER_HOUR;
  const minuteLimit = userId ? MAX_REQUESTS_PER_MINUTE : 3;

  if (activeRequests.length >= hourlyLimit) {
    requestTimestamps.set(identity, activeRequests);
    return {
      allowed: false,
      window: 'hour',
      retryAfterSeconds: getRetryAfter(activeRequests[0], HOUR_MS, now),
    };
  }

  if (minuteRequests.length >= minuteLimit) {
    requestTimestamps.set(identity, activeRequests);
    return {
      allowed: false,
      window: 'minute',
      retryAfterSeconds: getRetryAfter(minuteRequests[0], MINUTE_MS, now),
    };
  }

  activeRequests.push(now);
  requestTimestamps.set(identity, activeRequests);
  return { allowed: true };
}

function getClientIp(requestHeaders: Headers): string | undefined {
  const realIp = requestHeaders.get('x-real-ip')?.trim();
  const forwardedIp = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = realIp || forwardedIp;

  if (!candidate || candidate.length > 64 || !/^[a-fA-F0-9:.]+$/.test(candidate)) {
    return undefined;
  }

  return candidate;
}

function getRetryAfter(oldestRequest: number, windowMs: number, now: number): number {
  return Math.max(1, Math.ceil((oldestRequest + windowMs - now) / 1000));
}

function cleanupExpiredEntries(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  const cutoff = now - HOUR_MS;
  for (const [identity, timestamps] of requestTimestamps) {
    const activeTimestamps = timestamps.filter(timestamp => timestamp > cutoff);
    if (activeTimestamps.length === 0) {
      requestTimestamps.delete(identity);
    } else {
      requestTimestamps.set(identity, activeTimestamps);
    }
  }

  lastCleanupAt = now;
}
