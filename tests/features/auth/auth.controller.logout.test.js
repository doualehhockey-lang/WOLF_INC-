// tests/features/auth/auth.controller.logout.test.js
// Covers lines 76-79: handleLogout when wolf_rt cookie is present and jwt.verify succeeds.
// Also covers the path where payload.jti is set → cacheDel(`rt:${jti}`) is called.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  apiKeys: ['key-test'],
<<<<<<< HEAD
  config: { JWT_REFRESH_SECRET: 'test-refresh-secret-very-long-32ch' },
}));

jest.unstable_mockModule('../../../src/features/auth/token.service.js', () => ({
  issueTokens: jest.fn(),
  refreshTokens: jest.fn(),
  verifyAccess: jest.fn(),
=======
  config:  { JWT_REFRESH_SECRET: 'test-refresh-secret-very-long-32ch' },
}));

jest.unstable_mockModule('../../../src/features/auth/token.service.js', () => ({
  issueTokens:   jest.fn(),
  refreshTokens: jest.fn(),
  verifyAccess:  jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

const mockCacheDel = jest.fn(async () => {});
jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  cacheDel: mockCacheDel,
}));

// ── Mock jsonwebtoken ─────────────────────────────────────────────────────────
const mockJwtVerify = jest.fn();
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { verify: mockJwtVerify },
}));

const { handleLogout } = await import('../../../src/features/auth/auth.controller.js');

function mockRes() {
  const res = {};
<<<<<<< HEAD
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
=======
  res.status      = jest.fn(() => res);
  res.json        = jest.fn(() => res);
  res.cookie      = jest.fn(() => res);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  res.clearCookie = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// handleLogout — rt present + jwt.verify succeeds + jti present (lines 76-79)
// ═════════════════════════════════════════════════════════════════════════════

describe('handleLogout — valid RT with jti (lines 76-79)', () => {
  test('calls cacheDel with rt:{jti} when verify succeeds and jti is in payload', async () => {
    mockJwtVerify.mockReturnValueOnce({ sub: 'user123', jti: 'abc-uuid-456' });

    const req = { cookies: { wolf_rt: 'valid.refresh.token' }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleLogout(req, res);

<<<<<<< HEAD
    expect(mockJwtVerify).toHaveBeenCalledWith(
      'valid.refresh.token',
      'test-refresh-secret-very-long-32ch'
    );
    expect(mockCacheDel).toHaveBeenCalledWith('rt:abc-uuid-456');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'wolf_rt',
      expect.objectContaining({ path: '/auth' })
    );
=======
    expect(mockJwtVerify).toHaveBeenCalledWith('valid.refresh.token', 'test-refresh-secret-very-long-32ch');
    expect(mockCacheDel).toHaveBeenCalledWith('rt:abc-uuid-456');
    expect(res.clearCookie).toHaveBeenCalledWith('wolf_rt', expect.objectContaining({ path: '/auth' }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('does NOT call cacheDel when payload has no jti', async () => {
    mockJwtVerify.mockReturnValueOnce({ sub: 'user123' }); // no jti

    const req = { cookies: { wolf_rt: 'valid.refresh.token' }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleLogout(req, res);

    expect(mockJwtVerify).toHaveBeenCalled();
    expect(mockCacheDel).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('does NOT call cacheDel when jwt.verify returns null', async () => {
    mockJwtVerify.mockReturnValueOnce(null);

    const req = { cookies: { wolf_rt: 'valid.refresh.token' }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleLogout(req, res);

    expect(mockCacheDel).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('silently ignores jwt.verify errors and still clears cookie', async () => {
<<<<<<< HEAD
    mockJwtVerify.mockImplementationOnce(() => {
      throw new Error('invalid token');
    });
=======
    mockJwtVerify.mockImplementationOnce(() => { throw new Error('invalid token'); });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    const req = { cookies: { wolf_rt: 'malformed.token' }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleLogout(req, res);

    expect(mockCacheDel).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('silently ignores cacheDel errors', async () => {
    mockJwtVerify.mockReturnValueOnce({ jti: 'xyz-jti' });
    mockCacheDel.mockRejectedValueOnce(new Error('Redis unavailable'));

    const req = { cookies: { wolf_rt: 'valid.token' }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleLogout(req, res);

    // cacheDel throws but the whole block is in try/catch → still ok
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
