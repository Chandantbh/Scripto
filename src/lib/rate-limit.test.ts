import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SlidingWindowRateLimiter } from './rate-limit';

test('allows requests up to the sliding-window limit', () => {
  const limiter = new SlidingWindowRateLimiter(3, 10_000);
  const now = 100_000;
  assert.equal(limiter.check('user:1', now).allowed, true);
  assert.equal(limiter.check('user:1', now + 1_000).allowed, true);
  assert.equal(limiter.check('user:1', now + 2_000).allowed, true);
  assert.equal(limiter.check('other:1', now + 2_000).allowed, true);
});

test('blocks the next request and reports retry time', () => {
  const limiter = new SlidingWindowRateLimiter(2, 10_000);
  limiter.check('ip:1', 100_000);
  limiter.check('ip:1', 101_000);
  const blocked = limiter.check('ip:1', 105_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 5);
});

test('forgets expired timestamps', () => {
  const limiter = new SlidingWindowRateLimiter(1, 1_000);
  assert.equal(limiter.check('ip:1', 100_000).allowed, true);
  assert.equal(limiter.check('ip:1', 100_500).allowed, false);
  assert.equal(limiter.check('ip:1', 101_001).allowed, true);
});
