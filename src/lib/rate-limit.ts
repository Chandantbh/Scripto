import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';

export const AI_RATE_LIMIT_REQUESTS = 15;
export const AI_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

type RateWindow = 'ai';

type RateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      window: RateWindow;
      retryAfterSeconds: number;
    };

export class SlidingWindowRateLimiter {
  private readonly timestamps = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = AI_RATE_LIMIT_REQUESTS, windowMs = AI_RATE_LIMIT_WINDOW_MS) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const active = (this.timestamps.get(key) ?? []).filter(timestamp => timestamp > now - this.windowMs);
    if (active.length >= this.maxRequests) {
      this.timestamps.set(key, active);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((active[0] + this.windowMs - now) / 1000)),
      };
    }
    active.push(now);
    this.timestamps.set(key, active);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset() {
    this.timestamps.clear();
  }
}

const aiRateLimiter = new SlidingWindowRateLimiter();

export async function checkAIRateLimit(now = Date.now()): Promise<RateLimitDecision> {
  const { userId } = await auth();
  const requestHeaders = await headers();
  const identity = userId
    ? `user:${userId}`
    : `ip:${getClientIp(requestHeaders) ?? 'unknown'}`;

  const decision = aiRateLimiter.check(identity, now);
  if (!decision.allowed) {
    return { allowed: false, window: 'ai', retryAfterSeconds: decision.retryAfterSeconds };
  }
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
