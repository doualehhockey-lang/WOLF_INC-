// tests/features/auth/auth.middleware.test.js
// requireJwt: no-header, non-Bearer, valid token, expired token, invalid token.
// requireApiKey: valid key → next(), invalid key → 403.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock config ───────────────────────────────────────────────────────────────
const mockApiKeys = ['valid-key-abc', 'valid-key-xyz'];
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  apiKeys: mockApiKeys,
}));

// ── Mock token.service ────────────────────────────────────────────────────────
const mockVerifyAccess = jest.fn();
jest.unstable_mockModule('../../../src/features/auth/token.service.js', () => ({
  verifyAccess: mockVerifyAccess,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { requireJwt, requireApiKey } = await import('../../../src/features/auth/auth.middleware.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
<<<<<<< HEAD
  res.json = jest.fn(() => res);
=======
  res.json   = jest.fn(() => res);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return res;
}

function mockReq(headers = {}) {
  return { headers };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. requireJwt — missing / malformed header
// ═════════════════════════════════════════════════════════════════════════════

describe('requireJwt — missing or malformed authorization header', () => {
  test('returns 401 when authorization header is absent', () => {
<<<<<<< HEAD
    const req = mockReq({});
    const res = mockRes();
=======
    const req  = mockReq({});
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'UNAUTHORIZED' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNAUTHORIZED' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when authorization header does not start with "Bearer "', () => {
<<<<<<< HEAD
    const req = mockReq({ authorization: 'Basic dXNlcjpwYXNz' });
    const res = mockRes();
=======
    const req  = mockReq({ authorization: 'Basic dXNlcjpwYXNz' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'UNAUTHORIZED' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNAUTHORIZED' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for "bearer " (lowercase) — case-sensitive', () => {
<<<<<<< HEAD
    const req = mockReq({ authorization: 'bearer mytoken' });
    const res = mockRes();
=======
    const req  = mockReq({ authorization: 'bearer mytoken' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. requireJwt — valid token
// ═════════════════════════════════════════════════════════════════════════════

describe('requireJwt — valid token', () => {
  test('calls next() when verifyAccess succeeds', () => {
    mockVerifyAccess.mockReturnValueOnce({ sub: 'user-1', role: 'admin' });
<<<<<<< HEAD
    const req = mockReq({ authorization: 'Bearer valid.jwt.token' });
    const res = mockRes();
=======
    const req  = mockReq({ authorization: 'Bearer valid.jwt.token' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('sets req.user from verifyAccess return value', () => {
    const payload = { sub: 'user-42', role: 'user' };
    mockVerifyAccess.mockReturnValueOnce(payload);
<<<<<<< HEAD
    const req = mockReq({ authorization: 'Bearer some.jwt' });
    const res = mockRes();
=======
    const req  = mockReq({ authorization: 'Bearer some.jwt' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(req.user).toEqual(payload);
  });

  test('passes the token (without "Bearer ") to verifyAccess', () => {
    mockVerifyAccess.mockReturnValueOnce({ sub: 'u' });
<<<<<<< HEAD
    const req = mockReq({ authorization: 'Bearer my.secret.token' });
    const res = mockRes();
=======
    const req  = mockReq({ authorization: 'Bearer my.secret.token' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(mockVerifyAccess).toHaveBeenCalledWith('my.secret.token');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. requireJwt — expired token
// ═════════════════════════════════════════════════════════════════════════════

describe('requireJwt — expired token', () => {
  test('returns 401 with TOKEN_EXPIRED when verifyAccess throws TokenExpiredError', () => {
<<<<<<< HEAD
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    mockVerifyAccess.mockImplementationOnce(() => {
      throw err;
    });

    const req = mockReq({ authorization: 'Bearer expired.jwt' });
    const res = mockRes();
=======
    const err  = new Error('jwt expired');
    err.name   = 'TokenExpiredError';
    mockVerifyAccess.mockImplementationOnce(() => { throw err; });

    const req  = mockReq({ authorization: 'Bearer expired.jwt' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'TOKEN_EXPIRED' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TOKEN_EXPIRED' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(next).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. requireJwt — invalid token (other errors)
// ═════════════════════════════════════════════════════════════════════════════

describe('requireJwt — invalid token', () => {
  test('returns 401 with TOKEN_INVALID for JsonWebTokenError', () => {
<<<<<<< HEAD
    const err = new Error('invalid signature');
    err.name = 'JsonWebTokenError';
    mockVerifyAccess.mockImplementationOnce(() => {
      throw err;
    });

    const req = mockReq({ authorization: 'Bearer bad.jwt' });
    const res = mockRes();
=======
    const err  = new Error('invalid signature');
    err.name   = 'JsonWebTokenError';
    mockVerifyAccess.mockImplementationOnce(() => { throw err; });

    const req  = mockReq({ authorization: 'Bearer bad.jwt' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'TOKEN_INVALID' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TOKEN_INVALID' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 with TOKEN_INVALID for generic Error', () => {
<<<<<<< HEAD
    mockVerifyAccess.mockImplementationOnce(() => {
      throw new Error('unexpected');
    });

    const req = mockReq({ authorization: 'Bearer weird.jwt' });
    const res = mockRes();
=======
    mockVerifyAccess.mockImplementationOnce(() => { throw new Error('unexpected'); });

    const req  = mockReq({ authorization: 'Bearer weird.jwt' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'TOKEN_INVALID' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TOKEN_INVALID' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. requireApiKey
// ═════════════════════════════════════════════════════════════════════════════

describe('requireApiKey — valid key', () => {
  test('calls next() when x-api-key is in apiKeys list', () => {
<<<<<<< HEAD
    const req = mockReq({ 'x-api-key': 'valid-key-abc' });
    const res = mockRes();
=======
    const req  = mockReq({ 'x-api-key': 'valid-key-abc' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('calls next() for second valid key', () => {
<<<<<<< HEAD
    const req = mockReq({ 'x-api-key': 'valid-key-xyz' });
    const res = mockRes();
=======
    const req  = mockReq({ 'x-api-key': 'valid-key-xyz' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireApiKey — invalid key', () => {
  test('returns 403 when x-api-key is absent', () => {
<<<<<<< HEAD
    const req = mockReq({});
    const res = mockRes();
=======
    const req  = mockReq({});
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'FORBIDDEN' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'FORBIDDEN' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when x-api-key is not in apiKeys list', () => {
<<<<<<< HEAD
    const req = mockReq({ 'x-api-key': 'hacker-key' });
    const res = mockRes();
=======
    const req  = mockReq({ 'x-api-key': 'hacker-key' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
<<<<<<< HEAD
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'FORBIDDEN' }));
=======
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'FORBIDDEN' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 for empty string key', () => {
<<<<<<< HEAD
    const req = mockReq({ 'x-api-key': '' });
    const res = mockRes();
=======
    const req  = mockReq({ 'x-api-key': '' });
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
