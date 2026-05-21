// tests/security/jwt-expiry.test.js
// Security invariant: JWT guard correctly rejects expired, tampered, and malformed tokens.
// Attacks: expired, wrong secret, alg:none, missing header, no Bearer prefix.

import { jest } from '@jest/globals';
import jwt       from 'jsonwebtoken';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  cacheSet:       jest.fn(async () => 'OK'),
  cacheGet:       jest.fn(async () => null),
  cacheDel:       jest.fn(async () => 1),
  cacheIncr:      jest.fn(async () => 1),
  cacheExpire:    jest.fn(async () => true),
  cacheGetBuffer: jest.fn(async () => null),
  cacheSetBuffer: jest.fn(async () => 'OK'),
  cacheTtl:       jest.fn(async () => -1),
  evalScript:     jest.fn(async () => null),
  redis:          null,
  redisAvailable: false,
}));

const JWT_SECRET = 'testjwtsecret__padding__1234567890abcdef';

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    JWT_SECRET,
    JWT_REFRESH_SECRET: 'testrefresh__padding__1234567890abcdef',
    NODE_ENV: 'test',
  },
  apiKeys: ['test-key'],
}));

const { verifyAccess } = await import('../../src/features/auth/token.service.js');
const { requireJwt }   = await import('../../src/features/auth/auth.middleware.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkMiddlewareEnv(rawHeader) {
  const req  = { headers: { authorization: rawHeader } };
  const res  = { _status: null, _body: null };
  res.status = (s) => { res._status = s; return res; };
  res.json   = (b) => { res._body   = b; return res; };
  const next = jest.fn();
  requireJwt(req, res, next);
  return { req, res, next };
}

function bearer(token) { return `Bearer ${token}`; }

// ═════════════════════════════════════════════════════════════════════════════
// 1. verifyAccess — unit-level
// ═════════════════════════════════════════════════════════════════════════════

describe('verifyAccess — token verification', () => {
  test('valid fresh token is accepted and returns correct sub', () => {
    const token   = jwt.sign({ sub: 'user-001', role: 'user' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: 60 });
    const payload = verifyAccess(token);
    expect(payload.sub).toBe('user-001');
    expect(payload.role).toBe('user');
  });

  test('expired token throws TokenExpiredError', () => {
    const token = jwt.sign({ sub: 'user-002' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: -1 });
    expect(() => verifyAccess(token)).toThrow(jwt.TokenExpiredError);
  });

  test('token signed with wrong secret throws JsonWebTokenError', () => {
    const token = jwt.sign({ sub: 'attacker' }, 'wrong-secret', { algorithm: 'HS256', expiresIn: 60 });
    expect(() => verifyAccess(token)).toThrow(jwt.JsonWebTokenError);
  });

  test('alg:none attack is rejected (algorithms: ["HS256"] restriction)', () => {
    // Manually craft a "none" algorithm JWT
    const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ sub: 'attacker', role: 'admin', exp: 9_999_999_999 })).toString('base64url');
    const noneToken = `${h}.${p}.`;
    expect(() => verifyAccess(noneToken)).toThrow();
  });

  test('empty string token throws', () => {
    expect(() => verifyAccess('')).toThrow();
  });

  test('random garbage string throws', () => {
    expect(() => verifyAccess('not-a-jwt-at-all')).toThrow();
  });

  test('role is preserved exactly — no privilege escalation after verify', () => {
    const token   = jwt.sign({ sub: 'u1', role: 'user' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: 60 });
    const payload = verifyAccess(token);
    expect(payload.role).toBe('user');
    expect(payload.role).not.toBe('admin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. requireJwt — middleware security
// ═════════════════════════════════════════════════════════════════════════════

describe('requireJwt — middleware rejection scenarios', () => {
  test('missing Authorization header → 401 UNAUTHORIZED', () => {
    const { res, next } = mkMiddlewareEnv(undefined);
    expect(res._status).toBe(401);
    expect(res._body.error).toBe('UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  test('Authorization header without Bearer prefix → 401', () => {
    const { res, next } = mkMiddlewareEnv('Basic dXNlcjpwYXNz');
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('Bearer prefix with empty token → 401', () => {
    const { res, next } = mkMiddlewareEnv('Bearer ');
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('expired token → 401 TOKEN_EXPIRED', () => {
    const token = jwt.sign({ sub: 'u3' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: -1 });
    const { res, next } = mkMiddlewareEnv(bearer(token));
    expect(res._status).toBe(401);
    expect(res._body.error).toBe('TOKEN_EXPIRED');
    expect(next).not.toHaveBeenCalled();
  });

  test('wrong-secret token → 401 TOKEN_INVALID', () => {
    const token = jwt.sign({ sub: 'u4' }, 'wrong', { algorithm: 'HS256', expiresIn: 60 });
    const { res, next } = mkMiddlewareEnv(bearer(token));
    expect(res._status).toBe(401);
    expect(res._body.error).toBe('TOKEN_INVALID');
    expect(next).not.toHaveBeenCalled();
  });

  test('alg:none attack via middleware → 401 TOKEN_INVALID', () => {
    const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ sub: 'hacker', role: 'admin', exp: 9_999_999_999 })).toString('base64url');
    const { res, next } = mkMiddlewareEnv(bearer(`${h}.${p}.`));
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireJwt — acceptance path', () => {
  test('valid token → calls next() and sets req.user', () => {
    const token = jwt.sign({ sub: 'u5', role: 'user' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: 60 });
    const { req, next } = mkMiddlewareEnv(bearer(token));
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.sub).toBe('u5');
    expect(req.user.role).toBe('user');
  });
});
