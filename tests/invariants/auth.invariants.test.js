// tests/invariants/auth.invariants.test.js
// Property-based invariants: JWT auth must be correct for all valid inputs
// and must reject for ALL invalid inputs — no exceptions.

import { jest } from '@jest/globals';
<<<<<<< HEAD
import jwt from 'jsonwebtoken';
=======
import jwt       from 'jsonwebtoken';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
<<<<<<< HEAD
  cacheSet: jest.fn(async () => 'OK'),
  cacheGet: jest.fn(async () => null),
  cacheDel: jest.fn(async () => 1),
  redis: null,
  redisAvailable: false,
  cacheIncr: jest.fn(),
  cacheExpire: jest.fn(),
  cacheGetBuffer: jest.fn(),
  cacheSetBuffer: jest.fn(),
  cacheTtl: jest.fn(),
  evalScript: jest.fn(),
  isRedisAvailable: jest.fn().mockReturnValue(false),
=======
  cacheSet: jest.fn(async () => 'OK'), cacheGet: jest.fn(async () => null),
  cacheDel: jest.fn(async () => 1),   redis: null, redisAvailable: false,
  cacheIncr: jest.fn(), cacheExpire: jest.fn(),
  cacheGetBuffer: jest.fn(), cacheSetBuffer: jest.fn(),
  cacheTtl: jest.fn(), evalScript: jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

const SECRET = 'testjwtsecret__padding__1234567890abcdef';

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: { JWT_SECRET: SECRET, JWT_REFRESH_SECRET: 'r'.repeat(40), NODE_ENV: 'test' },
  apiKeys: ['test-key'],
}));

const { verifyAccess } = await import('../../src/features/auth/token.service.js');

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 1: Valid tokens ALWAYS succeed
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 1: valid tokens always succeed', () => {
  const subjects = [
    'user-001',
    'user-abc-xyz',
    'user-with-very-long-id-1234567890',
    'UPPERCASE-USER',
    'user@domain.com',
    '123456789',
  ];

<<<<<<< HEAD
  test.each(subjects)('verifyAccess succeeds for sub="%s"', sub => {
    const token = jwt.sign({ sub, role: 'user' }, SECRET, { algorithm: 'HS256', expiresIn: 300 });
=======
  test.each(subjects)('verifyAccess succeeds for sub="%s"', (sub) => {
    const token   = jwt.sign({ sub, role: 'user' }, SECRET, { algorithm: 'HS256', expiresIn: 300 });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const payload = verifyAccess(token);
    expect(payload.sub).toBe(sub);
    expect(payload).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 2: Expired tokens ALWAYS fail with TokenExpiredError
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 2: expired tokens always fail', () => {
  const subs = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];

<<<<<<< HEAD
  test.each(subs)('expired token for sub="%s" always throws TokenExpiredError', sub => {
=======
  test.each(subs)('expired token for sub="%s" always throws TokenExpiredError', (sub) => {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const token = jwt.sign({ sub }, SECRET, { algorithm: 'HS256', expiresIn: -1 });
    expect(() => verifyAccess(token)).toThrow(jwt.TokenExpiredError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 3: Wrong-secret tokens ALWAYS fail
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 3: wrong-secret tokens always fail', () => {
  const wrongSecrets = [
    'wrong',
    'a'.repeat(40),
    '0'.repeat(40),
    'almost-right-secret!x',
    SECRET + 'x', // one char off
    SECRET.slice(1), // one char missing
  ];

<<<<<<< HEAD
  test.each(wrongSecrets)('token signed with "%s" always fails', wrongSecret => {
    const token = jwt.sign({ sub: 'attacker', role: 'admin' }, wrongSecret, {
      algorithm: 'HS256',
      expiresIn: 60,
    });
=======
  test.each(wrongSecrets)('token signed with "%s" always fails', (wrongSecret) => {
    const token = jwt.sign({ sub: 'attacker', role: 'admin' }, wrongSecret, { algorithm: 'HS256', expiresIn: 60 });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(() => verifyAccess(token)).toThrow(jwt.JsonWebTokenError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 4: Role is NEVER escalated beyond what was signed
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 4: role never escalated', () => {
  const roles = ['user', 'reader', 'viewer', 'operator'];

<<<<<<< HEAD
  test.each(roles)('role="%s" is preserved after verification', role => {
    const token = jwt.sign({ sub: 'u', role }, SECRET, { algorithm: 'HS256', expiresIn: 60 });
=======
  test.each(roles)('role="%s" is preserved after verification', (role) => {
    const token   = jwt.sign({ sub: 'u', role }, SECRET, { algorithm: 'HS256', expiresIn: 60 });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const payload = verifyAccess(token);
    expect(payload.role).toBe(role);
    expect(payload.role).not.toBe('admin');
    expect(payload.role).not.toBe('superadmin');
    expect(payload.role).not.toBe('root');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 5: Malformed inputs always throw
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 5: malformed tokens always throw', () => {
  const badTokens = [
    ['empty string', ''],
    ['single segment', 'notajwt'],
    ['two segments', 'header.payload'],
    ['random base64', Buffer.from('random').toString('base64')],
    ['spaces', '   '],
    ['null-like string', 'null'],
  ];

  test.each(badTokens)('%s → throws', (_label, token) => {
    expect(() => verifyAccess(token)).toThrow();
  });
});
