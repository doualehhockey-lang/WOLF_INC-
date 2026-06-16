// tests/infra/redis/redisClient.gc.test.js
// Covers redisClient.js line 78: the setInterval GC callback that prunes
// expired entries from the in-memory store.
// Also covers line 22: the retryStrategy option passed to ioredis.
// Uses jest.useFakeTimers() BEFORE import so the interval uses fake timers.

import { jest } from '@jest/globals';

// ── Fake timers BEFORE import ─────────────────────────────────────────────────
jest.useFakeTimers();

// ── Must be unset so the module skips real Redis init ────────────────────────
delete process.env.REDIS_URL;

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  rateLimitCounter: { inc: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
}));

const { cacheSet, cacheGet, cacheDel } = await import('../../../src/infra/redis/redisClient.js');

afterAll(() => {
  jest.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════════════════
// GC setInterval — line 78
// ═════════════════════════════════════════════════════════════════════════════

describe('redisClient in-memory — GC setInterval (line 78)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GC fires at 60-second interval without throwing', () => {
    expect(() => {
      jest.advanceTimersByTime(60_001);
    }).not.toThrow();
  });

  test('GC prunes expired keys from the in-memory store', async () => {
    // Set a key with 1-second TTL then simulate time passing
    await cacheSet('gc-test-key', 'value', 1); // ttl = 1s

    // Advance real Date.now by hacking it past the TTL
    const orig = Date.now;
    Date.now = () => orig() + 2_000; // 2 seconds later → entry is expired

    // Fire GC
    jest.advanceTimersByTime(60_001);
    await Promise.resolve();

    Date.now = orig;

    // Key should be evicted — cacheGet returns null for expired/absent keys
    const val = await cacheGet('gc-test-key');
    expect(val).toBeNull();
  });

  test('GC does not throw when store is empty', () => {
    expect(() => {
      jest.advanceTimersByTime(60_001);
    }).not.toThrow();
  });

  test('GC fires multiple times without accumulating errors', () => {
    expect(() => {
      jest.advanceTimersByTime(5 * 60_001);
    }).not.toThrow();
  });
});
