import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';

export const AI_RATE_LIMIT_REQUESTS = 15;
export const AI_RATE_LIMIT_WINDOW_MS = 10 * 60_000;
export const GUEST_AI_RATE_LIMIT_REQUESTS = 3;
export const GUEST_AI_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

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
const guestAiRateLimiter = new SlidingWindowRateLimiter(
  GUEST_AI_RATE_LIMIT_REQUESTS,
  GUEST_AI_RATE_LIMIT_WINDOW_MS,
);

export interface UpstashRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  provider: 'upstash' | 'memory';
}

export async function checkUpstashRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  now = Date.now(),
): Promise<UpstashRateLimitDecision | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redisKey = `scripto:ai:${Buffer.from(key).toString('base64url')}`;
  const member = `${now}:${crypto.randomUUID()}`;
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['ZREMRANGEBYSCORE', redisKey, 0, now - windowMs],
        ['ZADD', redisKey, now, member],
        ['ZCARD', redisKey],
        ['PEXPIRE', redisKey, windowMs],
      ]),
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error('[SECURITY] rate_limit_store_error', {
        event: 'upstash_rate_limit_unavailable',
        status: response.status,
      });
      return null;
    }

    const results = await response.json() as Array<{ result?: number }>;
    const count = Number(results[2]?.result ?? 0);
    if (count > maxRequests) {
      await fetch(`${url}/ZREM/${encodeURIComponent(redisKey)}/${encodeURIComponent(member)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }).catch(() => undefined);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
        provider: 'upstash',
      };
    }
    return { allowed: true, retryAfterSeconds: 0, provider: 'upstash' };
  } catch (error) {
    console.error('[SECURITY] rate_limit_store_error', {
      event: 'upstash_rate_limit_unavailable',
    });
    return null;
  }
}

export async function checkAIRateLimit(now = Date.now()): Promise<RateLimitDecision> {
  const { userId } = await auth();
  const requestHeaders = await headers();
  const identity = userId
    ? `user:${userId}`
    : `ip:${getClientIp(requestHeaders) ?? 'unknown'}`;

  const maxRequests = userId ? AI_RATE_LIMIT_REQUESTS : GUEST_AI_RATE_LIMIT_REQUESTS;
  const windowMs = userId ? AI_RATE_LIMIT_WINDOW_MS : GUEST_AI_RATE_LIMIT_WINDOW_MS;
  const distributedDecision = await checkUpstashRateLimit(identity, maxRequests, windowMs, now);
  const decision = distributedDecision
    ? { allowed: distributedDecision.allowed, retryAfterSeconds: distributedDecision.retryAfterSeconds }
    : userId
      ? aiRateLimiter.check(identity, now)
      : guestAiRateLimiter.check(identity, now);
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
