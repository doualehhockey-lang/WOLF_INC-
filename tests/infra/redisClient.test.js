// tests/infra/redisClient.test.js
// Unit tests for the in-memory fallback layer of redisClient.js.
// Redis is NOT required — all tests run against the Map-based fallback.

// Prevent config.js from crashing in test environment.
<<<<<<< HEAD
process.env.BASE_URL = 'http://localhost:3000';
process.env.PHONE_SALT = 'testsalt1234567890';
process.env.JWT_SECRET = 'testjwtsecret1234567890testjwtsecret1234567890';
process.env.JWT_REFRESH_SECRET = 'testrefreshsecret1234567890testrefreshsecret';
process.env.API_KEYS = 'test-key';
=======
process.env.BASE_URL   = 'http://localhost:3000';
process.env.PHONE_SALT = 'testsalt1234567890';
process.env.JWT_SECRET = 'testjwtsecret1234567890testjwtsecret1234567890';
process.env.JWT_REFRESH_SECRET = 'testrefreshsecret1234567890testrefreshsecret';
process.env.API_KEYS   = 'test-key';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
// Do NOT set REDIS_URL — forces in-memory fallback.

import {
  cacheGet,
  cacheSet,
  cacheSetBuffer,
  cacheGetBuffer,
  cacheDel,
  cacheIncr,
  cacheExpire,
  cacheTtl,
  redisAvailable,
} from '../../src/infra/redis/redisClient.js';

describe('redisClient — in-memory fallback', () => {
  const KEY = 'test:key';

  afterEach(async () => {
    await cacheDel(KEY);
  });

  test('redisAvailable is false without REDIS_URL', () => {
    expect(redisAvailable).toBe(false);
  });

  test('cacheSet / cacheGet round-trip', async () => {
    await cacheSet(KEY, 'hello');
    expect(await cacheGet(KEY)).toBe('hello');
  });

  test('cacheGet returns null for missing key', async () => {
    expect(await cacheGet('no:such:key')).toBeNull();
  });

  test('cacheSet with TTL expires key after window', async () => {
    await cacheSet(KEY, 'short-lived', 0.001); // 1 ms TTL
    await new Promise(r => setTimeout(r, 10));
    expect(await cacheGet(KEY)).toBeNull();
  });

  test('cacheSetBuffer / cacheGetBuffer round-trip', async () => {
    const buf = Buffer.from([0x01, 0x02, 0x03]);
    await cacheSetBuffer(KEY, buf);
    const result = await cacheGetBuffer(KEY);
    expect(result).toEqual(buf);
  });

  test('cacheGetBuffer returns null for missing key', async () => {
    expect(await cacheGetBuffer('no:buffer:key')).toBeNull();
  });

  test('cacheDel removes key', async () => {
    await cacheSet(KEY, 'bye');
    await cacheDel(KEY);
    expect(await cacheGet(KEY)).toBeNull();
  });

  test('cacheIncr increments from zero', async () => {
    expect(await cacheIncr(KEY)).toBe(1);
    expect(await cacheIncr(KEY)).toBe(2);
    expect(await cacheIncr(KEY)).toBe(3);
  });

  test('cacheIncr preserves existing TTL', async () => {
    await cacheSet(KEY, '5', 60);
    await cacheIncr(KEY);
    const ttl = await cacheTtl(KEY);
    expect(ttl).toBeGreaterThan(0);
  });

  test('cacheExpire sets TTL on existing key', async () => {
    await cacheSet(KEY, 'value');
    await cacheExpire(KEY, 60);
    const ttl = await cacheTtl(KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  test('cacheTtl returns -1 for key without TTL', async () => {
    await cacheSet(KEY, 'persistent');
    expect(await cacheTtl(KEY)).toBe(-1);
  });

  test('cacheTtl returns -1 for missing key', async () => {
    expect(await cacheTtl('ghost:key')).toBe(-1);
  });
});
