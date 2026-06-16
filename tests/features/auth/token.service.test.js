// tests/features/auth/token.service.test.js
// issueTokens: returns correct shape, cache fail is graceful.
// verifyAccess: valid, expired, invalid token.
// refreshTokens: missing jti, revoked jti, cache unavailable, success + rotation.

import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
<<<<<<< HEAD
    JWT_SECRET: 'test-access-secret-very-long-32ch',
=======
    JWT_SECRET:         'test-access-secret-very-long-32ch',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    JWT_REFRESH_SECRET: 'test-refresh-secret-very-long-32ch',
  },
}));

// ── Mock redisClient ──────────────────────────────────────────────────────────
const mockCacheSet = jest.fn(async () => {});
const mockCacheGet = jest.fn(async () => '1');
const mockCacheDel = jest.fn(async () => {});
jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  cacheSet: mockCacheSet,
  cacheGet: mockCacheGet,
  cacheDel: mockCacheDel,
<<<<<<< HEAD
  isRedisAvailable: jest.fn().mockReturnValue(false),
  evalScript: jest.fn(async () => null),
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { issueTokens, verifyAccess, refreshTokens } =
  await import('../../../src/features/auth/token.service.js');

const { config } = await import('../../../src/core/config.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheSet.mockResolvedValue(undefined);
  mockCacheGet.mockResolvedValue('1');
  mockCacheDel.mockResolvedValue(undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. issueTokens
// ═════════════════════════════════════════════════════════════════════════════

describe('issueTokens', () => {
  test('returns accessToken, refreshToken, expiresIn', async () => {
    const result = await issueTokens({ sub: 'user-1', role: 'admin' });
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result).toHaveProperty('expiresIn');
    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
    expect(result.expiresIn).toBe(15 * 60);
  });

  test('accessToken contains sub and role claims', async () => {
    const { accessToken } = await issueTokens({ sub: 'user-42', role: 'admin' });
    const decoded = jwt.verify(accessToken, config.JWT_SECRET);
    expect(decoded.sub).toBe('user-42');
    expect(decoded.role).toBe('admin');
  });

  test('defaults role to "user" when not provided', async () => {
    const { accessToken } = await issueTokens({ sub: 'user-99' });
    const decoded = jwt.verify(accessToken, config.JWT_SECRET);
    expect(decoded.role).toBe('user');
  });

  test('refreshToken contains sub and jti claims', async () => {
    const { refreshToken } = await issueTokens({ sub: 'user-1' });
    const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
    expect(decoded.sub).toBe('user-1');
    expect(typeof decoded.jti).toBe('string');
    expect(decoded.jti.length).toBeGreaterThan(0);
  });

  test('calls cacheSet to persist refresh token jti', async () => {
    await issueTokens({ sub: 'user-1' });
    expect(mockCacheSet).toHaveBeenCalledTimes(1);
    const [key, value, ttl] = mockCacheSet.mock.calls[0];
    expect(key).toMatch(/^rt:/);
    expect(value).toBe('1');
    expect(ttl).toBe(7 * 24 * 3600);
  });

  test('does not throw when cacheSet fails (best-effort)', async () => {
    mockCacheSet.mockRejectedValueOnce(new Error('Redis down'));
    await expect(issueTokens({ sub: 'user-1' })).resolves.toHaveProperty('accessToken');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. verifyAccess
// ═════════════════════════════════════════════════════════════════════════════

describe('verifyAccess', () => {
  test('returns decoded payload for a valid token', async () => {
    const { accessToken } = await issueTokens({ sub: 'user-5', role: 'user' });
    const decoded = verifyAccess(accessToken);
    expect(decoded.sub).toBe('user-5');
    expect(decoded.role).toBe('user');
  });

  test('throws TokenExpiredError for an expired token', () => {
    const expired = jwt.sign({ sub: 'user-x' }, config.JWT_SECRET, { expiresIn: -1 });
    expect(() => verifyAccess(expired)).toThrow();
  });

  test('throws JsonWebTokenError for a token signed with wrong secret', () => {
    const bad = jwt.sign({ sub: 'user-x' }, 'wrong-secret');
    expect(() => verifyAccess(bad)).toThrow();
  });

  test('throws for a completely invalid token string', () => {
    expect(() => verifyAccess('not.a.token')).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. refreshTokens
// ═════════════════════════════════════════════════════════════════════════════

describe('refreshTokens — success', () => {
  test('returns new accessToken and refreshToken', async () => {
    const { refreshToken } = await issueTokens({ sub: 'user-refresh' });
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheDel.mockResolvedValue(undefined);
    mockCacheSet.mockResolvedValue(undefined);

    const result = await refreshTokens(refreshToken);

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.expiresIn).toBe(15 * 60);
  });

  test('deletes old jti from cache on rotation', async () => {
    const { refreshToken } = await issueTokens({ sub: 'user-rotate' });
    const oldPayload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheDel.mockResolvedValue(undefined);
    mockCacheSet.mockResolvedValue(undefined);

    await refreshTokens(refreshToken);

    expect(mockCacheDel).toHaveBeenCalledWith(`rt:${oldPayload.jti}`);
  });
});

describe('refreshTokens — revoked token', () => {
  test('throws when cacheGet returns null (revoked)', async () => {
    const { refreshToken } = await issueTokens({ sub: 'user-revoked' });
    mockCacheGet.mockResolvedValue(null);

    await expect(refreshTokens(refreshToken)).rejects.toThrow('Refresh token revoked');
  });
});

describe('refreshTokens — invalid token', () => {
  test('throws for bad refresh token signature', async () => {
    const bad = jwt.sign({ sub: 'user', jti: 'abc' }, 'wrong-secret');
    await expect(refreshTokens(bad)).rejects.toThrow();
  });

  test('throws for expired refresh token', async () => {
<<<<<<< HEAD
    const expired = jwt.sign({ sub: 'user-x', jti: 'some-id' }, config.JWT_REFRESH_SECRET, {
      expiresIn: -1,
    });
=======
    const expired = jwt.sign(
      { sub: 'user-x', jti: 'some-id' },
      config.JWT_REFRESH_SECRET,
      { expiresIn: -1 },
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await expect(refreshTokens(expired)).rejects.toThrow();
  });
});

describe('refreshTokens — cache unavailable', () => {
  test('throws when cacheGet throws (cache error = fail closed)', async () => {
    const { refreshToken } = await issueTokens({ sub: 'user-cache-err' });
    mockCacheGet.mockRejectedValueOnce(new Error('ECONNRESET'));

<<<<<<< HEAD
    await expect(refreshTokens(refreshToken)).rejects.toThrow();
  });

  test('throws when cacheDel throws (C5: abort rotation to prevent JTI replay)', async () => {
=======
    await expect(refreshTokens(refreshToken)).rejects.toThrow('ECONNRESET');
  });

  test('proceeds even when cacheDel throws (non-critical rotation step)', async () => {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const { refreshToken } = await issueTokens({ sub: 'user-del-err' });
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockRejectedValueOnce(new Error('del failed'));

<<<<<<< HEAD
    // C5 FIX: cacheDel failure aborts rotation — old JTI stays valid, replay window prevented
    await expect(refreshTokens(refreshToken)).rejects.toThrow('Session rotation failed');
=======
    // Should NOT throw — deletion failure is best-effort
    await expect(refreshTokens(refreshToken)).resolves.toHaveProperty('accessToken');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});
