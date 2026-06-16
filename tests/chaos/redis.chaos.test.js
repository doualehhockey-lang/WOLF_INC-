// tests/chaos/redis.chaos.test.js
// Chaos tests: Redis in-memory fallback must be resilient to all access patterns.
// Tests cacheGet/cacheSet/cacheDel/cacheIncr/cacheExpire/cacheTtl behaviors.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// Import AFTER mocks — REDIS_URL not set in test env → in-memory fallback
const {
<<<<<<< HEAD
  cacheGet,
  cacheSet,
  cacheDel,
  cacheIncr,
  cacheExpire,
  cacheTtl,
  cacheGetBuffer,
  cacheSetBuffer,
  redisAvailable,
=======
  cacheGet, cacheSet, cacheDel, cacheIncr, cacheExpire, cacheTtl,
  cacheGetBuffer, cacheSetBuffer, redisAvailable,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
} = await import('../../src/infra/redis/redisClient.js');

// ═════════════════════════════════════════════════════════════════════════════
// Sanity: in-memory mode is active
// ═════════════════════════════════════════════════════════════════════════════

describe('Redis chaos — fallback mode active', () => {
  test('redisAvailable is false in test environment', () => {
    expect(redisAvailable).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Basic get/set/del operations
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: basic cache operations', () => {
  const KEY = `chaos:basic:${Date.now()}`;

<<<<<<< HEAD
  afterEach(async () => {
    await cacheDel(KEY);
  });
=======
  afterEach(async () => { await cacheDel(KEY); });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  test('cacheGet on missing key returns null (no crash)', async () => {
    await expect(cacheGet('chaos:nonexistent:xyz')).resolves.toBeNull();
  });

  test('cacheSet + cacheGet roundtrip', async () => {
    await cacheSet(KEY, 'hello-world', 60);
    expect(await cacheGet(KEY)).toBe('hello-world');
  });

  test('cacheSet overwrites previous value', async () => {
    await cacheSet(KEY, 'first', 60);
    await cacheSet(KEY, 'second', 60);
    expect(await cacheGet(KEY)).toBe('second');
  });

  test('cacheDel removes key → subsequent get returns null', async () => {
    await cacheSet(KEY, 'to-delete', 60);
    await cacheDel(KEY);
    expect(await cacheGet(KEY)).toBeNull();
  });

  test('cacheDel on non-existent key does not throw', async () => {
    await expect(cacheDel('chaos:does-not-exist:zzz')).resolves.not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// cacheIncr behavior (used by rate limiter)
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: cacheIncr atomic counter behavior', () => {
  test('fresh key starts at 1', async () => {
    const key = `chaos:incr:${Date.now()}`;
    const c = await cacheIncr(key);
    expect(c).toBe(1);
    await cacheDel(key);
  });

  test('sequential increments accumulate correctly', async () => {
    const key = `chaos:incr:seq:${Date.now()}`;
    for (let i = 1; i <= 10; i++) {
      const count = await cacheIncr(key);
      expect(count).toBe(i);
    }
    await cacheDel(key);
  });

  test('multiple keys increment independently', async () => {
    const keyA = `chaos:incr:a:${Date.now()}`;
    const keyB = `chaos:incr:b:${Date.now()}`;

    await cacheIncr(keyA);
    await cacheIncr(keyA);
    await cacheIncr(keyB);

    const a = await cacheIncr(keyA); // should be 3
    const b = await cacheIncr(keyB); // should be 2

    expect(a).toBe(3);
    expect(b).toBe(2);

    await cacheDel(keyA);
    await cacheDel(keyB);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TTL behavior
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: TTL operations', () => {
  test('cacheTtl on existing key with TTL returns positive value', async () => {
    const key = `chaos:ttl:${Date.now()}`;
    await cacheSet(key, 'val', 300);
    const ttl = await cacheTtl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
    await cacheDel(key);
  });

  test('cacheTtl on non-existent key returns -1', async () => {
    const ttl = await cacheTtl('chaos:nonexistent:ttl:xyz');
    expect(ttl).toBe(-1);
  });

  test('cacheExpire updates TTL on existing key', async () => {
    const key = `chaos:expire:${Date.now()}`;
    await cacheSet(key, 'val'); // no TTL
    await cacheExpire(key, 120);
    const ttl = await cacheTtl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(120);
    await cacheDel(key);
  });

  test('cacheSet with no TTL stores value permanently (-1 TTL)', async () => {
    const key = `chaos:notttl:${Date.now()}`;
    await cacheSet(key, 'forever');
    const ttl = await cacheTtl(key);
    expect(ttl).toBe(-1); // no expiry
    await cacheDel(key);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Buffer operations
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: buffer cache operations', () => {
  test('cacheSetBuffer + cacheGetBuffer roundtrip', async () => {
    const key = `chaos:buf:${Date.now()}`;
<<<<<<< HEAD
    const original = Buffer.from([0x01, 0x02, 0x03, 0xff]);
=======
    const original = Buffer.from([0x01, 0x02, 0x03, 0xFF]);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await cacheSetBuffer(key, original, 60);
    const retrieved = await cacheGetBuffer(key);
    expect(Buffer.isBuffer(retrieved)).toBe(true);
    expect(retrieved).toEqual(original);
    await cacheDel(key);
  });

  test('cacheGetBuffer on missing key returns null', async () => {
    const val = await cacheGetBuffer('chaos:buf:nonexistent:xyz');
    expect(val).toBeNull();
  });
});
