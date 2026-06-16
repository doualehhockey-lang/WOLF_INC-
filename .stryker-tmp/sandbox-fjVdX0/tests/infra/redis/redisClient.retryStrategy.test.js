// @ts-nocheck
// tests/infra/redis/redisClient.retryStrategy.test.js
// Covers redisClient.js line 22: retryStrategy function (times => Math.min(times * 100, 3000)).
// Captures the retryStrategy from the Redis constructor options and tests its logic.

import { jest } from '@jest/globals';

process.env.REDIS_URL          = 'redis://localhost:6379';
process.env.BASE_URL           = 'http://localhost:3000';
process.env.PHONE_SALT         = 'testsalt1234567890';
process.env.JWT_SECRET         = 'testjwtsecret1234567890testjwtsecret1234567890';
process.env.JWT_REFRESH_SECRET = 'testrefreshsecret1234567890testrefreshsecret';
process.env.API_KEYS           = 'test-key';

// Capture the Redis constructor call options
let capturedOptions = null;

const mockRedisInstance = {
  connect:   jest.fn(async () => {}),
  ping:      jest.fn(async () => 'PONG'),
  get:       jest.fn(async () => null),
  set:       jest.fn(async () => 'OK'),
  setex:     jest.fn(async () => 'OK'),
  del:       jest.fn(async () => 1),
  incr:      jest.fn(async () => 1),
  expire:    jest.fn(async () => 1),
  ttl:       jest.fn(async () => -1),
  getBuffer: jest.fn(async () => null),
  eval:      jest.fn(async () => 42),
  on:        jest.fn(),
};

jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn((url, opts) => {
    capturedOptions = opts;
    return mockRedisInstance;
  }),
}));

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  rateLimitCounter: { inc: jest.fn() },
}));

await import('../../../src/infra/redis/redisClient.js');

// ═════════════════════════════════════════════════════════════════════════════
// retryStrategy — line 22
// ═════════════════════════════════════════════════════════════════════════════

describe('redisClient — retryStrategy (line 22)', () => {
  test('retryStrategy is defined in the ioredis options', () => {
    expect(capturedOptions).not.toBeNull();
    expect(typeof capturedOptions.retryStrategy).toBe('function');
  });

  test('retryStrategy(1) = 100ms', () => {
    expect(capturedOptions.retryStrategy(1)).toBe(100);
  });

  test('retryStrategy(10) = 1000ms', () => {
    expect(capturedOptions.retryStrategy(10)).toBe(1000);
  });

  test('retryStrategy(30) = 3000ms (capped at max)', () => {
    expect(capturedOptions.retryStrategy(30)).toBe(3000);
  });

  test('retryStrategy(100) = 3000ms (still capped)', () => {
    expect(capturedOptions.retryStrategy(100)).toBe(3000);
  });
});
