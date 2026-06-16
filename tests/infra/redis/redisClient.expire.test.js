// tests/infra/redis/redisClient.expire.test.js
// Covers redisClient.js line 120: cacheExpire on existing key (if (existing) true branch)

import { jest } from '@jest/globals';

// Prevent real Redis connection
jest.unstable_mockModule('ioredis', () => {
  const Redis = jest.fn(() => ({
<<<<<<< HEAD
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK'),
    setex: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
    incr: jest.fn(async () => 1),
    expire: jest.fn(async () => 1),
    ttl: jest.fn(async () => -1),
    getBuffer: jest.fn(async () => null),
    on: jest.fn(),
=======
    get:    jest.fn(async () => null),
    set:    jest.fn(async () => 'OK'),
    setex:  jest.fn(async () => 'OK'),
    del:    jest.fn(async () => 1),
    incr:   jest.fn(async () => 1),
    expire: jest.fn(async () => 1),
    ttl:    jest.fn(async () => -1),
    getBuffer: jest.fn(async () => null),
    on:     jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    status: 'end',
  }));
  return { default: Redis };
});

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
<<<<<<< HEAD
    REDIS_URL: '', // no Redis → in-memory fallback
    REDIS_TLS: false,
    NODE_ENV: 'test',
=======
    REDIS_URL:  '',   // no Redis → in-memory fallback
    REDIS_TLS:  false,
    NODE_ENV:   'test',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
}));

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const { cacheSet, cacheGet, cacheExpire, cacheTtl } =
  await import('../../../src/infra/redis/redisClient.js');

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 120: cacheExpire — if (existing) TRUE branch
// ═════════════════════════════════════════════════════════════════════════════

describe('cacheExpire — existing key TRUE branch (line 120)', () => {
  test('updates expiresAt when key exists in in-memory store', async () => {
    const key = 'expire-test-key';

    // Set a key with a TTL (so it has an expiresAt)
    await cacheSet(key, 'some-value', 60);

    // Verify it's in the store
    const val = await cacheGet(key);
    expect(val).toBe('some-value');

    // Now call cacheExpire — this should update expiresAt (line 120 TRUE branch)
    await cacheExpire(key, 120);

    // TTL should now be ~120 seconds (within a small tolerance)
    const ttl = await cacheTtl(key);
    expect(ttl).toBeGreaterThan(100);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  test('cacheExpire on non-existent key is a no-op (line 120 FALSE branch)', async () => {
    // Should not throw when key doesn't exist
    await expect(cacheExpire('nonexistent-key-xyz', 60)).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 69: _memSet ttlSec default (null → expiresAt = null)
// ═════════════════════════════════════════════════════════════════════════════

describe('cacheSet — null ttlSec (no expiry)', () => {
  test('sets key without expiry when ttlSec is null', async () => {
    // cacheSet(key, value) — ttlSec defaults to null, _memSet gets null → expiresAt = null
    await cacheSet('no-ttl-key', 'persistent-value');
    const val = await cacheGet('no-ttl-key');
    expect(val).toBe('persistent-value');

    // TTL should be -1 (no expiry)
    const ttl = await cacheTtl('no-ttl-key');
    expect(ttl).toBe(-1);
  });
});
