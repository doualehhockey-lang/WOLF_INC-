// @ts-nocheck
// tests/infra/redis/redisClient.gcprune.test.js
// Covers redisClient.js line 78: GC loop body — _store.delete(k) TRUE branch
// Uses jest fake timers + setSystemTime to ensure entries are truly expired when GC fires.

import { jest } from '@jest/globals';

// Use fake timers BEFORE import so setInterval uses fake timers
jest.useFakeTimers();
jest.setSystemTime(0);  // Pin fake time at epoch 0

delete process.env.REDIS_URL;  // Use in-memory store

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: { REDIS_URL: '', REDIS_TLS: false, NODE_ENV: 'test' },
}));

const { cacheSet, cacheGet } = await import('../../../src/infra/redis/redisClient.js');

afterAll(() => {
  jest.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 78: GC interval — _store.delete(k) TRUE branch
// ═════════════════════════════════════════════════════════════════════════════

describe('redisClient GC — _store.delete TRUE branch (line 78)', () => {
  test('GC deletes expired entry when system time advances past TTL', async () => {
    // At fake time = 0, set a key with 1-second TTL
    // expiresAt = 0 + 1*1000 = 1000
    jest.setSystemTime(0);
    await cacheSet('gc-prune-key', 'to-be-pruned', 1);

    // Verify the key exists
    expect(await cacheGet('gc-prune-key')).toBe('to-be-pruned');

    // Advance system time past TTL: now = 2000 > expiresAt=1000 → entry is expired
    jest.setSystemTime(2_000);

    // Fire the GC interval (runs every 60s, advance 60001ms of fake timer time)
    jest.advanceTimersByTime(60_001);
    await Promise.resolve();

    // Key should be deleted by GC (line 78 TRUE branch)
    const val = await cacheGet('gc-prune-key');
    expect(val).toBeNull();
  });

  test('GC skips non-expired entries (line 78 FALSE branch preserved)', async () => {
    // At time = 2000 (from prev test), set a key with 300s TTL
    // expiresAt = 2000 + 300*1000 = 302000 → won't expire when GC fires
    await cacheSet('gc-keep-key', 'still-alive', 300);

    // Fire GC again — this entry should NOT be deleted
    jest.advanceTimersByTime(60_001);
    await Promise.resolve();

    const val = await cacheGet('gc-keep-key');
    expect(val).toBe('still-alive');
  });
});
