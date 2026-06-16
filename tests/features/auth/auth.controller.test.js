// tests/features/auth/auth.controller.test.js
// handleIssue: missing apiKey → 400, invalid key → 401, success → cookie + JSON.
// handleRefresh: no cookie → 401, invalid RT → 401 + clear cookie, success → rotate.
// handleLogout: no cookie → ok, invalid RT → ok (ignore), success → clear cookie + ok.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock config ───────────────────────────────────────────────────────────────
const mockApiKeys = ['key-abc123', 'key-xyz789'];
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  apiKeys: mockApiKeys,
<<<<<<< HEAD
  config: { JWT_REFRESH_SECRET: 'test-refresh-secret-very-long-32ch' },
}));

// ── Mock token.service ────────────────────────────────────────────────────────
const mockIssueTokens = jest.fn();
const mockRefreshTokens = jest.fn();
const mockVerifyAccess = jest.fn();
jest.unstable_mockModule('../../../src/features/auth/token.service.js', () => ({
  issueTokens: mockIssueTokens,
  refreshTokens: mockRefreshTokens,
  verifyAccess: mockVerifyAccess,
=======
  config:  { JWT_REFRESH_SECRET: 'test-refresh-secret-very-long-32ch' },
}));

// ── Mock token.service ────────────────────────────────────────────────────────
const mockIssueTokens   = jest.fn();
const mockRefreshTokens = jest.fn();
const mockVerifyAccess  = jest.fn();
jest.unstable_mockModule('../../../src/features/auth/token.service.js', () => ({
  issueTokens:   mockIssueTokens,
  refreshTokens: mockRefreshTokens,
  verifyAccess:  mockVerifyAccess,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Mock redisClient ──────────────────────────────────────────────────────────
const mockCacheDel = jest.fn(async () => {});
jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  cacheDel: mockCacheDel,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { handleIssue, handleRefresh, handleLogout } =
  await import('../../../src/features/auth/auth.controller.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockRes() {
  const res = {};
<<<<<<< HEAD
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
=======
  res.status     = jest.fn(() => res);
  res.json       = jest.fn(() => res);
  res.cookie     = jest.fn(() => res);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  res.clearCookie = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIssueTokens.mockResolvedValue({
<<<<<<< HEAD
    accessToken: 'access.token.here',
    refreshToken: 'refresh.token.here',
    expiresIn: 900,
  });
  mockRefreshTokens.mockResolvedValue({
    accessToken: 'new.access.token',
    refreshToken: 'new.refresh.token',
    expiresIn: 900,
=======
    accessToken:  'access.token.here',
    refreshToken: 'refresh.token.here',
    expiresIn:    900,
  });
  mockRefreshTokens.mockResolvedValue({
    accessToken:  'new.access.token',
    refreshToken: 'new.refresh.token',
    expiresIn:    900,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. handleIssue
// ═════════════════════════════════════════════════════════════════════════════

describe('handleIssue — input validation', () => {
  test('returns 400 when apiKey is missing', async () => {
    const req = { body: {}, ip: '127.0.0.1' };
    const res = mockRes();

    await handleIssue(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'VALIDATION_ERROR' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(mockIssueTokens).not.toHaveBeenCalled();
  });

  test('returns 400 when apiKey is not a string (number)', async () => {
    const req = { body: { apiKey: 12345 }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleIssue(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 401 when apiKey is not in apiKeys list', async () => {
    const req = { body: { apiKey: 'unknown-key' }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleIssue(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'UNAUTHORIZED' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNAUTHORIZED' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(mockIssueTokens).not.toHaveBeenCalled();
  });
});

describe('handleIssue — success', () => {
  test('calls issueTokens with the correct sub (last 8 chars of apiKey)', async () => {
    const req = { body: { apiKey: 'key-abc123' }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleIssue(req, res);

    expect(mockIssueTokens).toHaveBeenCalledWith(
<<<<<<< HEAD
      expect.objectContaining({ sub: 'y-abc123', role: 'admin' })
=======
      expect.objectContaining({ sub: 'y-abc123', role: 'user' }),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );
  });

  test('sets wolf_rt HttpOnly cookie on success', async () => {
    const req = { body: { apiKey: 'key-abc123' }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleIssue(req, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'wolf_rt',
      'refresh.token.here',
<<<<<<< HEAD
      expect.objectContaining({ httpOnly: true })
=======
      expect.objectContaining({ httpOnly: true }),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );
  });

  test('responds with accessToken, expiresIn, tokenType on success', async () => {
    const req = { body: { apiKey: 'key-abc123' }, ip: '127.0.0.1' };
    const res = mockRes();

    await handleIssue(req, res);

    expect(res.json).toHaveBeenCalledWith({
      accessToken: 'access.token.here',
<<<<<<< HEAD
      expiresIn: '15m',
      tokenType: 'Bearer',
=======
      expiresIn:   '15m',
      tokenType:   'Bearer',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. handleRefresh
// ═════════════════════════════════════════════════════════════════════════════

describe('handleRefresh — no cookie', () => {
  test('returns 401 when wolf_rt cookie is absent', async () => {
    const req = { cookies: {} };
    const res = mockRes();

    await handleRefresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'UNAUTHORIZED' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNAUTHORIZED' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(mockRefreshTokens).not.toHaveBeenCalled();
  });

  test('returns 401 when cookies is undefined', async () => {
    const req = {};
    const res = mockRes();

    await handleRefresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('handleRefresh — invalid refresh token', () => {
  test('returns 401 and clears cookie when refreshTokens throws', async () => {
    mockRefreshTokens.mockRejectedValueOnce(new Error('Refresh token revoked'));
    const req = { cookies: { wolf_rt: 'bad.refresh.token' } };
    const res = mockRes();

    await handleRefresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'TOKEN_INVALID' }));
    expect(res.clearCookie).toHaveBeenCalledWith(
      'wolf_rt',
      expect.objectContaining({ path: '/auth' })
    );
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TOKEN_INVALID' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith('wolf_rt', expect.objectContaining({ path: '/auth' }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

describe('handleRefresh — success', () => {
  test('rotates cookie and returns new accessToken', async () => {
    const req = { cookies: { wolf_rt: 'valid.refresh.token' } };
    const res = mockRes();

    await handleRefresh(req, res);

    expect(mockRefreshTokens).toHaveBeenCalledWith('valid.refresh.token');
    expect(res.cookie).toHaveBeenCalledWith(
      'wolf_rt',
      'new.refresh.token',
<<<<<<< HEAD
      expect.objectContaining({ httpOnly: true })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'new.access.token', tokenType: 'Bearer' })
=======
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'new.access.token', tokenType: 'Bearer' }),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. handleLogout
// ═════════════════════════════════════════════════════════════════════════════

describe('handleLogout', () => {
  test('clears cookie and returns ok:true when no cookie present', async () => {
    const req = { cookies: {}, ip: '127.0.0.1' };
    const res = mockRes();

    await handleLogout(req, res);

<<<<<<< HEAD
    expect(res.clearCookie).toHaveBeenCalledWith(
      'wolf_rt',
      expect.objectContaining({ path: '/auth' })
    );
=======
    expect(res.clearCookie).toHaveBeenCalledWith('wolf_rt', expect.objectContaining({ path: '/auth' }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns ok:true and clears cookie even when cookies is undefined', async () => {
    const req = { ip: '127.0.0.1' };
    const res = mockRes();

    await handleLogout(req, res);

    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
