// @ts-nocheck
// tests/security/ratelimit-race.test.js
// Security invariant: rate limiter blocks at exactly RATE_LIMIT (20 calls/window).
// Independent phone numbers must have isolated counters.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/metrics.js', () => ({
  rateLimitCounter: { inc: jest.fn() },
}));

// In-memory counter store shared by the mock
const _counters = {};

const mockIncr = jest.fn(async (key) => {
  _counters[key] = (_counters[key] ?? 0) + 1;
  return _counters[key];
});

jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  redisAvailable: false, // force in-memory fallback path
  evalScript:     jest.fn(async () => null),
  cacheIncr:      mockIncr,
  cacheExpire:    jest.fn(async () => true),
  cacheGet:       jest.fn(async () => null),
  cacheSet:       jest.fn(async () => 'OK'),
  cacheDel:       jest.fn(async () => 1),
  redis:          null,
}));

const { isRateLimited } = await import('../../src/features/voice/rate-limiter.js');

const RATE_LIMIT = 20; // must match rate-limiter.js constant

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(_counters).forEach(k => delete _counters[k]);
});

// ═════════════════════════════════════════════════════════════════════════════
// Fixed-window semantics
// ═════════════════════════════════════════════════════════════════════════════

describe('rate limiter — fixed-window semantics', () => {
  test(`first ${RATE_LIMIT} calls for same phone are allowed`, async () => {
    const phone = '+33611111111';
    for (let i = 0; i < RATE_LIMIT; i++) {
      const limited = await isRateLimited(phone);
      expect(limited).toBe(false);
    }
  });

  test(`call number ${RATE_LIMIT + 1} is blocked`, async () => {
    const phone = '+33622222222';
    for (let i = 0; i < RATE_LIMIT; i++) await isRateLimited(phone);
    const limited = await isRateLimited(phone);
    expect(limited).toBe(true);
  });

  test('calls after block continue to be blocked', async () => {
    const phone = '+33633333333';
    for (let i = 0; i < RATE_LIMIT + 5; i++) await isRateLimited(phone);
    // All subsequent must be blocked
    expect(await isRateLimited(phone)).toBe(true);
    expect(await isRateLimited(phone)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Isolation: different phones have independent counters
// ═════════════════════════════════════════════════════════════════════════════

describe('rate limiter — phone number isolation', () => {
  test('maxing out phone A does not affect phone B', async () => {
    const phoneA = '+33641111111';
    const phoneB = '+33642222222';

    // Exhaust phone A
    for (let i = 0; i < RATE_LIMIT + 1; i++) await isRateLimited(phoneA);
    expect(await isRateLimited(phoneA)).toBe(true);

    // Phone B at 0 → should be allowed
    expect(await isRateLimited(phoneB)).toBe(false);
  });

  test('two phones can each use up to RATE_LIMIT independently', async () => {
    const phoneC = '+33643333333';
    const phoneD = '+33644444444';

    for (let i = 0; i < RATE_LIMIT; i++) {
      expect(await isRateLimited(phoneC)).toBe(false);
      expect(await isRateLimited(phoneD)).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Edge cases — special values never rate-limited
// ═════════════════════════════════════════════════════════════════════════════

describe('rate limiter — edge cases', () => {
  test('null phone is never rate-limited (unknown caller)', async () => {
    expect(await isRateLimited(null)).toBe(false);
  });

  test('"unknown" phone string is never rate-limited', async () => {
    expect(await isRateLimited('unknown')).toBe(false);
  });

  test('undefined phone is never rate-limited', async () => {
    expect(await isRateLimited(undefined)).toBe(false);
  });
});
