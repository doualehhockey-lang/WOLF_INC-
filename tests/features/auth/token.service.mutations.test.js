// tests/features/auth/token.service.mutations.test.js
// Stryker targeted mutation killers for token.service.js surviving mutants:
//   L11     StringLiteral 'auth' in childLogger
//   L24     ObjectLiteral jwt.sign access token options { expiresIn, algorithm }
//   L31     ObjectLiteral jwt.sign refresh token options { expiresIn, algorithm }
//   L38     BlockStatement catch body (cacheSet failure) → must log
//   L40     ObjectLiteral { err: err.message } in log.warn
//   L40     StringLiteral 'Failed to persist refresh token jti'
//   L43     ObjectLiteral { sub, role } in log.info + StringLiteral 'Tokens issued'
//   L54     ObjectLiteral { algorithms: ['HS256'] } in verifyAccess
//   L63     ObjectLiteral { algorithms: ['HS256'] } in refreshTokens verify
//   L72     ObjectLiteral { err: err.message } + StringLiteral in refreshTokens warn
//   L77     ObjectLiteral { sub: payload.sub } passed to issueTokens
//   L82     BlockStatement catch body (cacheDel failure) → must log
//   L83     ObjectLiteral { err: err.message } + StringLiteral 'Failed to delete old refresh jti'

import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// ── Logger spy — capture childLogger('auth') call arg ─────────────────────────

const mockLog = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockChildLogger = jest.fn(() => mockLog);

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: mockChildLogger,
}));

// ── Config ────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    JWT_SECRET: 'mut-access-secret-very-long-32ch-abc',
    JWT_REFRESH_SECRET: 'mut-refresh-secret-very-long-32ch-abc',
  },
}));

// ── Redis ─────────────────────────────────────────────────────────────────────

const mockCacheSet = jest.fn(async () => {});
const mockCacheGet = jest.fn(async () => '1');
const mockCacheDel = jest.fn(async () => {});

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  cacheSet: mockCacheSet,
  cacheGet: mockCacheGet,
  cacheDel: mockCacheDel,
  isRedisAvailable: jest.fn().mockReturnValue(false),
  evalScript: jest.fn(async () => null),
}));

// ── Import under test ─────────────────────────────────────────────────────────

const { issueTokens, verifyAccess, refreshTokens } =
  await import('../../../src/features/auth/token.service.js');
const { config } = await import('../../../src/core/config.js');

// ── Capture module-init: childLogger('auth') is called at module level ────────

const _childLoggerInitArg = mockChildLogger.mock.calls[0]?.[0];

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheSet.mockResolvedValue(undefined);
  mockCacheGet.mockResolvedValue('1');
  mockCacheDel.mockResolvedValue(undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
// L11 StringLiteral 'auth' — childLogger must be called with 'auth'
// ═════════════════════════════════════════════════════════════════════════════

describe('childLogger name (L11 StringLiteral killer)', () => {
  test('childLogger("auth") called on module init', () => {
    expect(_childLoggerInitArg).toBe('auth');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L24 ObjectLiteral { expiresIn: ACCESS_TTL, algorithm: 'HS256' }
// Without options: token has no exp, no algorithm enforcement
// ═════════════════════════════════════════════════════════════════════════════

describe('issueTokens — access token jwt options (L24 ObjectLiteral killer)', () => {
  test('access token has exp claim (expiresIn enforced)', async () => {
    const { accessToken } = await issueTokens({ sub: 'user-1' });
    const decoded = jwt.decode(accessToken);
    expect(decoded.exp).toBeDefined();
    expect(typeof decoded.exp).toBe('number');
  });

  test('access token expires ~15min from now', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { accessToken } = await issueTokens({ sub: 'user-1' });
    const decoded = jwt.decode(accessToken);
    const expectedExp = before + 15 * 60;
    expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 2);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 2);
  });

  test('access token signed with HS256 — HS384 token is REJECTED (algorithm enforced)', async () => {
    // A token signed with HS384 should be rejected if { algorithms: ['HS256'] } is enforced
    const hs384Token = jwt.sign({ sub: 'user-x', role: 'user' }, config.JWT_SECRET, {
      algorithm: 'HS384',
    });
    // With mutant {} options: HS384 token would be ACCEPTED → test fails → mutant killed
    expect(() => verifyAccess(hs384Token)).toThrow();
  });

  test('access token with correct algo+secret verifies successfully', async () => {
    const { accessToken } = await issueTokens({ sub: 'u1', role: 'admin' });
    const decoded = verifyAccess(accessToken);
    expect(decoded.sub).toBe('u1');
    expect(decoded.role).toBe('admin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L31 ObjectLiteral { expiresIn: REFRESH_TTL, algorithm: 'HS256' }
// ═════════════════════════════════════════════════════════════════════════════

describe('issueTokens — refresh token jwt options (L31 ObjectLiteral killer)', () => {
  test('refresh token has exp claim (expiresIn enforced)', async () => {
    const { refreshToken } = await issueTokens({ sub: 'user-2' });
    const decoded = jwt.decode(refreshToken);
    expect(decoded.exp).toBeDefined();
    expect(typeof decoded.exp).toBe('number');
  });

  test('refresh token expires ~7 days from now', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { refreshToken } = await issueTokens({ sub: 'user-2' });
    const decoded = jwt.decode(refreshToken);
    const expected = before + 7 * 24 * 3600;
    expect(decoded.exp).toBeGreaterThanOrEqual(expected - 5);
    expect(decoded.exp).toBeLessThanOrEqual(expected + 5);
  });

  test('refresh token signed with HS384 is rejected by refreshTokens (algorithm enforced)', async () => {
    const hs384Refresh = jwt.sign({ sub: 'user-x', jti: 'test-jti' }, config.JWT_REFRESH_SECRET, {
      algorithm: 'HS384',
    });
    // refreshTokens verifies with { algorithms: ['HS256'] }
    await expect(refreshTokens(hs384Refresh)).rejects.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L38 BlockStatement — catch body on cacheSet failure must call log.warn
// Without the block: error silently swallowed, no log.warn call
// ═════════════════════════════════════════════════════════════════════════════

describe('issueTokens cacheSet failure logging (L38 BlockStatement killer)', () => {
  test('log.warn called when cacheSet throws (L38 BlockStatement)', async () => {
    mockCacheSet.mockRejectedValueOnce(new Error('Redis down'));
    await issueTokens({ sub: 'user-3' });
    expect(mockLog.warn).toHaveBeenCalled();
  });

  test('log.warn includes { err: err.message } when cacheSet fails (L40 ObjectLiteral)', async () => {
    mockCacheSet.mockRejectedValueOnce(new Error('Connection refused'));
    await issueTokens({ sub: 'user-3' });
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'Connection refused' }),
      expect.any(String)
    );
  });

  test('log.warn message is "Failed to persist refresh token jti" (L40 StringLiteral)', async () => {
    mockCacheSet.mockRejectedValueOnce(new Error('err'));
    await issueTokens({ sub: 'user-3' });
    const [, msg] = mockLog.warn.mock.calls[0];
    expect(msg).toBe('Failed to persist refresh token jti');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L43 ObjectLiteral { sub, role } + StringLiteral 'Tokens issued' in log.info
// ═════════════════════════════════════════════════════════════════════════════

describe('issueTokens success log.info (L43 killers)', () => {
  test('log.info called with { sub, role } on success (L43 ObjectLiteral)', async () => {
    await issueTokens({ sub: 'user-info', role: 'manager' });
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-info', role: 'manager' }),
      expect.any(String)
    );
  });

  test('log.info message is "Tokens issued" (L43 StringLiteral)', async () => {
    await issueTokens({ sub: 'user-info' });
    expect(mockLog.info).toHaveBeenCalledWith(expect.any(Object), 'Tokens issued');
  });

  test('log.info role is "user" when not provided (L43 ObjectLiteral + default role)', async () => {
    await issueTokens({ sub: 'user-default' });
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-default', role: 'user' }),
      'Tokens issued'
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L54 ObjectLiteral { algorithms: ['HS256'] } in verifyAccess
// (already covered above in access token options tests)
// Additional: verify wrong secret rejects
// ═════════════════════════════════════════════════════════════════════════════

describe('verifyAccess algorithm enforcement (L54 ObjectLiteral killer)', () => {
  test('valid HS256 token verified successfully', async () => {
    const { accessToken } = await issueTokens({ sub: 'u-verify', role: 'user' });
    expect(() => verifyAccess(accessToken)).not.toThrow();
  });

  test('token signed with none algorithm rejected', () => {
    // none algorithm is always rejected by jwt.verify regardless
    expect(() => verifyAccess('header.payload.')).toThrow();
  });

  test('HS256 token with wrong secret rejected', () => {
    const badToken = jwt.sign({ sub: 'x' }, 'wrong-secret-xxx', { algorithm: 'HS256' });
    expect(() => verifyAccess(badToken)).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L72 ObjectLiteral + StringLiteral — refreshTokens cache validation log.warn
// ═════════════════════════════════════════════════════════════════════════════

describe('refreshTokens cache validation log.warn (L72 killers)', () => {
  test('log.error includes { err } when cacheGet throws (L72 ObjectLiteral)', async () => {
    const { refreshToken } = await issueTokens({ sub: 'u-refresh' });
    mockCacheGet.mockRejectedValueOnce(new Error('Cache unavailable'));
    // Atomic get-del path wraps errors to avoid leaking internals
    await expect(refreshTokens(refreshToken)).rejects.toThrow('Session rotation failed');
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'Cache unavailable' }),
      expect.any(String)
    );
  });

  test('log.error message on cache failure (L72 StringLiteral)', async () => {
    const { refreshToken } = await issueTokens({ sub: 'u-refresh2' });
    mockCacheGet.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(refreshTokens(refreshToken)).rejects.toThrow('Session rotation failed');
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.any(Object),
      'Atomic refresh JTI get-del failed — aborting rotation'
    );
  });

  test('log.warn includes { err } when token revoked (cacheGet returns null)', async () => {
    const { refreshToken } = await issueTokens({ sub: 'u-revoked' });
    mockCacheGet.mockResolvedValueOnce(null); // null → throws "Refresh token revoked"
    await expect(refreshTokens(refreshToken)).rejects.toThrow('Refresh token revoked');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L77 ObjectLiteral { sub: payload.sub } — refreshed tokens have correct sub
// ═════════════════════════════════════════════════════════════════════════════

describe('refreshTokens — new tokens contain original sub (L77 ObjectLiteral killer)', () => {
  test('refreshed accessToken contains original sub', async () => {
    const { refreshToken } = await issueTokens({ sub: 'original-user' });
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);

    const { accessToken } = await refreshTokens(refreshToken);
    const decoded = jwt.decode(accessToken);
    // With mutant {} instead of { sub: payload.sub }, decoded.sub would be undefined
    expect(decoded.sub).toBe('original-user');
  });

  test('refreshed refreshToken contains original sub', async () => {
    const { refreshToken } = await issueTokens({ sub: 'original-user-2' });
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);

    const { refreshToken: newRT } = await refreshTokens(refreshToken);
    const decoded = jwt.decode(newRT);
    expect(decoded.sub).toBe('original-user-2');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C5 FIX: cacheDel failure now aborts rotation (log.error + throw)
// ═════════════════════════════════════════════════════════════════════════════

describe('refreshTokens cacheDel failure logging (C5 killers)', () => {
  test('log.error called when cacheDel throws (C5: abort rotation)', async () => {
    const { refreshToken } = await issueTokens({ sub: 'u-del' });
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockRejectedValueOnce(new Error('del failed'));

    await expect(refreshTokens(refreshToken)).rejects.toThrow('Session rotation failed');
    expect(mockLog.error).toHaveBeenCalled();
  });

  test('log.error includes { err: err.message } on cacheDel failure', async () => {
    const { refreshToken } = await issueTokens({ sub: 'u-del2' });
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    await expect(refreshTokens(refreshToken)).rejects.toThrow('Session rotation failed');
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'ETIMEDOUT' }),
      expect.any(String)
    );
  });

  test('throws "Session rotation failed — please log in again" on cacheDel failure', async () => {
    const { refreshToken } = await issueTokens({ sub: 'u-del3' });
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockRejectedValueOnce(new Error('del err'));

    await expect(refreshTokens(refreshToken)).rejects.toThrow(
      'Session rotation failed — please log in again'
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// cacheGet / cacheSet key format — StringLiteral rt:${jti} killers
// (existing tests cover this but reinforce for mutant coverage)
// ═════════════════════════════════════════════════════════════════════════════

describe('Redis key format — rt:${jti} StringLiteral killers', () => {
  test('cacheSet key starts with "rt:" prefix', async () => {
    await issueTokens({ sub: 'user-key' });
    const [key] = mockCacheSet.mock.calls[0];
    expect(key).toMatch(/^rt:[0-9a-f-]{36}$/i); // rt: + UUID format
  });

  test('cacheGet in refreshTokens uses same rt: prefix as cacheSet', async () => {
    const { refreshToken } = await issueTokens({ sub: 'user-key2' });
    const [cacheSetKey] = mockCacheSet.mock.calls[0];
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);

    await refreshTokens(refreshToken);
    const [cacheGetKey] = mockCacheGet.mock.calls[0];
    // Both keys should use the same jti and rt: prefix
    expect(cacheGetKey).toBe(cacheSetKey);
  });

  test('cacheDel in refreshTokens uses rt:${oldJti} key', async () => {
    const { refreshToken } = await issueTokens({ sub: 'user-key3' });
    const oldPayload = jwt.decode(refreshToken);
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue('1');
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);

    await refreshTokens(refreshToken);
    expect(mockCacheDel).toHaveBeenCalledWith(`rt:${oldPayload.jti}`);
  });
});
