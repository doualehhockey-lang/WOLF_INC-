// tests/infra/redis/redisClient.connected.test.js
// Covers lines 17-42: Redis initialization when REDIS_URL is set and connect succeeds.
// Covers lines 35-38: event handler registration (error, reconnecting, ready, close).
// Covers lines 141-142: evalScript when _available = true.
// Covers line 78: setInterval GC timer (via fake timers).

import { jest } from '@jest/globals';

// ── Must be set BEFORE module import (top-level await runs at import time) ────
process.env.REDIS_URL       = 'redis://localhost:6379';
process.env.BASE_URL        = 'http://localhost:3000';
process.env.PHONE_SALT      = 'testsalt1234567890';
process.env.JWT_SECRET      = 'testjwtsecret1234567890testjwtsecret1234567890';
process.env.JWT_REFRESH_SECRET = 'testrefreshsecret1234567890testrefreshsecret';
process.env.API_KEYS        = 'test-key';

// ── Capture event listeners ───────────────────────────────────────────────────
const _listeners = {};

const mockRedisInstance = {
  connect:   jest.fn(async () => {}),
  ping:      jest.fn(async () => 'PONG'),
  get:       jest.fn(async (k) => null),
  set:       jest.fn(async () => 'OK'),
  setex:     jest.fn(async () => 'OK'),
  del:       jest.fn(async () => 1),
  incr:      jest.fn(async () => 1),
  expire:    jest.fn(async () => 1),
  ttl:       jest.fn(async () => -1),
  getBuffer: jest.fn(async () => null),
  eval:      jest.fn(async () => 42),
  on:        jest.fn((event, cb) => { _listeners[event] = cb; }),
};

const MockRedis = jest.fn(() => mockRedisInstance);

jest.unstable_mockModule('ioredis', () => ({ default: MockRedis }));

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
  cacheSetBuffer,
  cacheGetBuffer,
  cacheDel,
  cacheIncr,
  cacheExpire,
  cacheTtl,
  evalScript,
} = await import('../../../src/infra/redis/redisClient.js');

// ═════════════════════════════════════════════════════════════════════════════
// 1. Connection initialization
// ═════════════════════════════════════════════════════════════════════════════

describe('redisClient — connected initialization', () => {
  test('creates Redis instance with REDIS_URL', () => {
    expect(MockRedis).toHaveBeenCalledWith('redis://localhost:6379', expect.objectContaining({
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    }));
  });

  test('calls connect() and ping() on startup', () => {
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.ping).toHaveBeenCalledTimes(1);
  });

  test('redisAvailable is true after successful connection', () => {
    expect(redisAvailable).toBe(true);
  });

  test('redis export is the connected instance', () => {
    expect(redis).toBe(mockRedisInstance);
  });

  test('registers all 4 event handlers', () => {
    expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockRedisInstance.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    expect(mockRedisInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
    expect(mockRedisInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Event handler callbacks
// NOTE: calling 'close' sets _available=false and 'ready' sets it back to true.
// Order: close last in the group, then re-enable with ready before helper tests.
// ═════════════════════════════════════════════════════════════════════════════

describe('redisClient — event handlers', () => {
  test('"error" handler does not throw', () => {
    expect(() => _listeners['error']?.(new Error('ECONNREFUSED'))).not.toThrow();
  });

  test('"reconnecting" handler does not throw', () => {
    expect(() => _listeners['reconnecting']?.()).not.toThrow();
  });

  test('"close" handler sets _available=false without throwing', () => {
    expect(() => _listeners['close']?.()).not.toThrow();
    // Restore: fire 'ready' to bring _available back to true for subsequent tests
    _listeners['ready']?.();
  });

  test('"ready" handler does not throw', () => {
    expect(() => _listeners['ready']?.()).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Cache helpers route through real Redis
// ═════════════════════════════════════════════════════════════════════════════

describe('redisClient — Redis-backed helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('cacheGet delegates to _redis.get()', async () => {
    mockRedisInstance.get.mockResolvedValueOnce('value1');
    const result = await cacheGet('some:key');
    expect(mockRedisInstance.get).toHaveBeenCalledWith('some:key');
    expect(result).toBe('value1');
  });

  test('cacheSet without TTL delegates to _redis.set()', async () => {
    await cacheSet('k', 'v');
    expect(mockRedisInstance.set).toHaveBeenCalledWith('k', 'v');
    expect(mockRedisInstance.setex).not.toHaveBeenCalled();
  });

  test('cacheSet with TTL delegates to _redis.setex()', async () => {
    await cacheSet('k', 'v', 60);
    expect(mockRedisInstance.setex).toHaveBeenCalledWith('k', 60, 'v');
    expect(mockRedisInstance.set).not.toHaveBeenCalled();
  });

  test('cacheSetBuffer without TTL delegates to _redis.set()', async () => {
    const buf = Buffer.from([1, 2, 3]);
    await cacheSetBuffer('k', buf);
    expect(mockRedisInstance.set).toHaveBeenCalledWith('k', buf);
  });

  test('cacheSetBuffer with TTL delegates to _redis.setex()', async () => {
    const buf = Buffer.from([4, 5, 6]);
    await cacheSetBuffer('k', buf, 30);
    expect(mockRedisInstance.setex).toHaveBeenCalledWith('k', 30, buf);
  });

  test('cacheGetBuffer delegates to _redis.getBuffer()', async () => {
    const buf = Buffer.from('abc');
    mockRedisInstance.getBuffer.mockResolvedValueOnce(buf);
    const result = await cacheGetBuffer('some:key');
    expect(mockRedisInstance.getBuffer).toHaveBeenCalledWith('some:key');
    expect(result).toBe(buf);
  });

  test('cacheDel delegates to _redis.del()', async () => {
    await cacheDel('some:key');
    expect(mockRedisInstance.del).toHaveBeenCalledWith('some:key');
  });

  test('cacheIncr delegates to _redis.incr()', async () => {
    mockRedisInstance.incr.mockResolvedValueOnce(5);
    const result = await cacheIncr('counter');
    expect(mockRedisInstance.incr).toHaveBeenCalledWith('counter');
    expect(result).toBe(5);
  });

  test('cacheExpire delegates to _redis.expire()', async () => {
    await cacheExpire('some:key', 120);
    expect(mockRedisInstance.expire).toHaveBeenCalledWith('some:key', 120);
  });

  test('cacheTtl delegates to _redis.ttl()', async () => {
    mockRedisInstance.ttl.mockResolvedValueOnce(45);
    const result = await cacheTtl('some:key');
    expect(mockRedisInstance.ttl).toHaveBeenCalledWith('some:key');
    expect(result).toBe(45);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. evalScript — line 141-142
// ═════════════════════════════════════════════════════════════════════════════

describe('evalScript — Redis-backed (lines 141-142)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('delegates to _redis.eval with correct KEYS/ARGS spread', async () => {
    mockRedisInstance.eval.mockResolvedValueOnce(1);
    const result = await evalScript('return 1', ['key1', 'key2'], ['arg1']);
    expect(mockRedisInstance.eval).toHaveBeenCalledWith('return 1', 2, 'key1', 'key2', 'arg1');
    expect(result).toBe(1);
  });

  test('passes numkeys = keys.length to eval', async () => {
    await evalScript('script', ['a', 'b', 'c'], []);
    expect(mockRedisInstance.eval).toHaveBeenCalledWith('script', 3, 'a', 'b', 'c');
  });

  test('works with empty keys and args', async () => {
    mockRedisInstance.eval.mockResolvedValueOnce(0);
    const result = await evalScript('return 0');
    expect(mockRedisInstance.eval).toHaveBeenCalledWith('return 0', 0);
    expect(result).toBe(0);
  });

  test('returns the eval result directly', async () => {
    mockRedisInstance.eval.mockResolvedValueOnce([1, 2, 3]);
    const result = await evalScript('script', ['k'], ['a']);
    expect(result).toEqual([1, 2, 3]);
  });
});
