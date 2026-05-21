// @ts-nocheck
// tests/infra/redis/redisClient.fail.test.js
// Covers lines 39-42: catch block when Redis connect() throws.
// Separate file because module initialization runs once at import time.

import { jest } from '@jest/globals';

// ── Set REDIS_URL to trigger the init block ───────────────────────────────────
process.env.REDIS_URL          = 'redis://bad-host:6379';
process.env.BASE_URL           = 'http://localhost:3000';
process.env.PHONE_SALT         = 'testsalt1234567890';
process.env.JWT_SECRET         = 'testjwtsecret1234567890testjwtsecret1234567890';
process.env.JWT_REFRESH_SECRET = 'testrefreshsecret1234567890testrefreshsecret';
process.env.API_KEYS           = 'test-key';

// ── ioredis mock: connect() throws ───────────────────────────────────────────
const mockFailInstance = {
  connect: jest.fn(async () => { throw new Error('ECONNREFUSED bad-host:6379'); }),
  ping:    jest.fn(),
  on:      jest.fn(),
};

jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn(() => mockFailInstance),
}));

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  rateLimitCounter: { inc: jest.fn() },
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const {
  redis,
  redisAvailable,
  cacheGet,
  cacheSet,
  cacheDel,
  evalScript,
} = await import('../../../src/infra/redis/redisClient.js');

// ═════════════════════════════════════════════════════════════════════════════
// Catch block (lines 39-42)
// ═════════════════════════════════════════════════════════════════════════════

describe('redisClient — connection failure (catch block)', () => {
  test('redisAvailable is false when connect() throws', () => {
    expect(redisAvailable).toBe(false);
  });

  test('redis export is null after failed connect', () => {
    expect(redis).toBeNull();
  });

  test('connect() was called (attempted connection)', () => {
    expect(mockFailInstance.connect).toHaveBeenCalledTimes(1);
  });

  test('ping() was NOT called after failed connect', () => {
    expect(mockFailInstance.ping).not.toHaveBeenCalled();
  });

  test('no event handlers registered after failure', () => {
    expect(mockFailInstance.on).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Fallback behavior after failed connect
// ═════════════════════════════════════════════════════════════════════════════

describe('redisClient — in-memory fallback after failure', () => {
  test('cacheGet returns null (in-memory miss)', async () => {
    expect(await cacheGet('any:key')).toBeNull();
  });

  test('cacheSet/cacheGet round-trip works via in-memory', async () => {
    await cacheSet('fail-test:key', 'hello');
    const val = await cacheGet('fail-test:key');
    expect(val).toBe('hello');
    await cacheDel('fail-test:key');
  });

  test('evalScript returns null in fallback mode', async () => {
    const result = await evalScript('return 1', ['k'], ['a']);
    expect(result).toBeNull();
  });
});
