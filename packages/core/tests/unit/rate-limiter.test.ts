/**
 * P1.3: 令牌桶限流器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenBucketRateLimiter, getDefaultRateLimiter, setDefaultRateLimiter } from '../../src/tools/harness/rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  it('has correct initial token count', () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 3, refillRate: 1 });
    expect(limiter.available).toBe(3);
  });

  it('acquire() reduces available tokens', async () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 3, refillRate: 100 });
    await limiter.acquire();
    expect(limiter.available).toBeLessThan(3);
  });

  it('release() restores a token', async () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 3, refillRate: 100 });
    await limiter.acquire();
    const before = limiter.available;
    limiter.release();
    expect(limiter.available).toBeGreaterThanOrEqual(before);
  });

  it('refills tokens over time', async () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 5, refillRate: 1000 });
    // Drain all tokens
    for (let i = 0; i < 5; i++) await limiter.acquire();
    const before = limiter.available;
    // Wait for ~10ms (1000 tokens/sec = 10 tokens in 10ms)
    await new Promise(r => setTimeout(r, 20));
    expect(limiter.available).toBeGreaterThan(before);
  });

  it('available never exceeds maxTokens', () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 3, refillRate: 100 });
    limiter.release();
    limiter.release();
    limiter.release();
    expect(limiter.available).toBeLessThanOrEqual(3);
  });

  it('acquire() waits when tokens are exhausted', async () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 1, refillRate: 100 });
    await limiter.acquire(); // drain
    const startTime = Date.now();
    // This should wait for refill (~10ms for 1 token at 100/sec)
    await limiter.acquire();
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThan(5); // at least some wait
  });
});

describe('getDefaultRateLimiter', () => {
  it('returns consistent singleton', () => {
    const a = getDefaultRateLimiter();
    const b = getDefaultRateLimiter();
    expect(a).toBe(b);
  });

  it('setDefaultRateLimiter replaces the singleton', () => {
    const custom = new TokenBucketRateLimiter({ maxTokens: 10, refillRate: 10 });
    setDefaultRateLimiter(custom);
    expect(getDefaultRateLimiter()).toBe(custom);
    // Restore default for other tests
    setDefaultRateLimiter(new TokenBucketRateLimiter());
  });
});
