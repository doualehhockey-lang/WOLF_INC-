// tests/features/voice/rate-limiter.redis.test.js
// Rate limiter: Redis Lua path (redisAvailable=true always — separate module registry).
// Covers: allowed, blocked, counter, args, hashed key, evalScript null, error fail-open.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockRateLimitCounter = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  rateLimitCounter: mockRateLimitCounter,
  auditLogFailures: { inc: jest.fn() },
}));

// ── Mock Redis helpers — redisAvailable: true (Redis path always) ─────────────
const mockEvalScript = jest.fn();

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  redisAvailable: true, // hardcoded — keeps Redis path always
  isRedisAvailable: jest.fn().mockReturnValue(true),
  evalScript: mockEvalScript,
  cacheIncr: jest.fn(),
  cacheExpire: jest.fn(),
}));

// ── Mock fs/promises (Lua script reader) ─────────────────────────────────────
jest.unstable_mockModule('fs/promises', () => ({
  readFile: jest.fn(async () => 'MOCK_LUA_SCRIPT'),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { isRateLimited } = await import('../../../src/features/voice/rate-limiter.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockEvalScript.mockResolvedValue([1, 1]); // default: allowed
});

// ═════════════════════════════════════════════════════════════════════════════
// Redis Lua path
// ═════════════════════════════════════════════════════════════════════════════

describe('isRateLimited — Redis Lua path', () => {
  test('returns false when Lua result[1] === 1 (allowed)', async () => {
    mockEvalScript.mockResolvedValueOnce([1, 1]);
    expect(await isRateLimited('+33612345678')).toBe(false);
  });

  test('returns true when Lua result[1] === 0 (blocked)', async () => {
    mockEvalScript.mockResolvedValueOnce([21, 0]);
    expect(await isRateLimited('+33612345678')).toBe(true);
  });

  test('increments rateLimitCounter when blocked', async () => {
    mockEvalScript.mockResolvedValueOnce([21, 0]);
    await isRateLimited('+33612345678');
    expect(mockRateLimitCounter.inc).toHaveBeenCalledTimes(1);
  });

  test('does NOT increment counter when allowed', async () => {
    mockEvalScript.mockResolvedValueOnce([1, 1]);
    await isRateLimited('+33612345678');
    expect(mockRateLimitCounter.inc).not.toHaveBeenCalled();
  });

  test('passes Lua script and rate-window/limit as string args', async () => {
    mockEvalScript.mockResolvedValueOnce([1, 1]);
    await isRateLimited('+33612345678');
    const [script, keys, args] = mockEvalScript.mock.calls[0];
    expect(typeof script).toBe('string');
    expect(keys.length).toBe(1);
    expect(args).toEqual([expect.any(String), expect.any(String)]);
  });

  test('key contains hashed phone (not raw number)', async () => {
    mockEvalScript.mockResolvedValueOnce([1, 1]);
    await isRateLimited('+33699887766');
    const [, keys] = mockEvalScript.mock.calls[0];
    expect(keys[0]).not.toContain('+33699887766'); // hashed
    expect(keys[0]).toMatch(/^rl:twilio:[a-f0-9]{12}$/);
  });

  test('returns false when evalScript returns null (no-op)', async () => {
    mockEvalScript.mockResolvedValueOnce(null);
    expect(await isRateLimited('+33612345678')).toBe(false);
  });

  test('returns false (fail open) when evalScript throws', async () => {
    mockEvalScript.mockRejectedValueOnce(new Error('EVAL failed'));
    expect(await isRateLimited('+33612345678')).toBe(false);
  });
});
