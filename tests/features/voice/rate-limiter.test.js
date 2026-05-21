// tests/features/voice/rate-limiter.test.js
// Rate limiter: in-memory fallback path (redisAvailable=false always).
// Covers: null/unknown phone passthrough, in-memory INCR path, error fail-open.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockRateLimitCounter = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  rateLimitCounter: mockRateLimitCounter,
}));

// ── Mock Redis helpers — redisAvailable: false (in-memory path) ───────────────
const mockCacheIncr   = jest.fn();
const mockCacheExpire = jest.fn();

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  redisAvailable: false, // hardcoded — keeps in-memory path always
  evalScript:     jest.fn(),
  cacheIncr:      mockCacheIncr,
  cacheExpire:    mockCacheExpire,
}));

// ── Mock fs/promises (Lua script reader) ─────────────────────────────────────
jest.unstable_mockModule('fs/promises', () => ({
  readFile: jest.fn(async () => 'MOCK_LUA_SCRIPT'),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { isRateLimited } = await import('../../../src/features/voice/rate-limiter.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheIncr.mockResolvedValue(1);
  mockCacheExpire.mockResolvedValue(1);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Passthrough — null / unknown phones
// ═════════════════════════════════════════════════════════════════════════════

describe('isRateLimited — passthrough', () => {
  test('returns false for null phone', async () => {
    expect(await isRateLimited(null)).toBe(false);
  });

  test('returns false for undefined phone', async () => {
    expect(await isRateLimited(undefined)).toBe(false);
  });

  test('returns false for "unknown" phone', async () => {
    expect(await isRateLimited('unknown')).toBe(false);
  });

  test('returns false for empty string', async () => {
    expect(await isRateLimited('')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. In-memory fallback path
// ═════════════════════════════════════════════════════════════════════════════

describe('isRateLimited — in-memory fallback', () => {
  test('returns false when count is 1 (first call)', async () => {
    mockCacheIncr.mockResolvedValueOnce(1);
    expect(await isRateLimited('+33600000001')).toBe(false);
  });

  test('calls cacheExpire when count === 1 (set window)', async () => {
    mockCacheIncr.mockResolvedValueOnce(1);
    await isRateLimited('+33600000002');
    expect(mockCacheExpire).toHaveBeenCalledWith(
      expect.stringMatching(/^rl:twilio:/),
      60, // RATE_WINDOW
    );
  });

  test('does NOT call cacheExpire when count > 1', async () => {
    mockCacheIncr.mockResolvedValueOnce(5);
    await isRateLimited('+33600000003');
    expect(mockCacheExpire).not.toHaveBeenCalled();
  });

  test('returns false when count === RATE_LIMIT (20)', async () => {
    mockCacheIncr.mockResolvedValueOnce(20);
    expect(await isRateLimited('+33600000004')).toBe(false);
  });

  test('returns true when count > RATE_LIMIT (21)', async () => {
    mockCacheIncr.mockResolvedValueOnce(21);
    expect(await isRateLimited('+33600000005')).toBe(true);
  });

  test('increments counter when blocked', async () => {
    mockCacheIncr.mockResolvedValueOnce(25);
    await isRateLimited('+33600000006');
    expect(mockRateLimitCounter.inc).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Error handling — fail open (in-memory path error)
// ═════════════════════════════════════════════════════════════════════════════

describe('isRateLimited — error handling (in-memory)', () => {
  test('returns false (fail open) when cacheIncr throws', async () => {
    mockCacheIncr.mockRejectedValueOnce(new Error('Redis ECONNRESET'));
    expect(await isRateLimited('+33612345678')).toBe(false);
  });
});
