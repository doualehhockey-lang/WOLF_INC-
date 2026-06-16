// tests/services/security.anon.test.js
// Covers security.js line 228: const rlKey = identity.sub || req.ip || 'anon'
// — right side 'anon' when BOTH identity.sub AND req.ip are falsy

<<<<<<< HEAD
import { jest } from '@jest/globals';
import { strict as assert } from 'assert';

await jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: { JWT_SECRET: 'test-secret-at-least-32-chars-long', API_KEYS: 'key-a' },
  apiKeys: ['key-a'],
  isProd: false,
  isTest: true,
=======
import { jest }   from '@jest/globals';
import { strict as assert } from 'assert';

await jest.unstable_mockModule('../../src/core/config.js', () => ({
  config:   { JWT_SECRET: 'test-secret-at-least-32-chars-long', API_KEYS: 'key-a' },
  apiKeys:  ['key-a'],
  isProd:   false,
  isTest:   true,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  corsOrigins: [],
}));

const mockVerifyAccess = jest.fn();
await jest.unstable_mockModule('../../src/features/auth/token.service.js', () => ({
<<<<<<< HEAD
  verifyAccess: mockVerifyAccess,
  issueTokens: jest.fn(),
  refreshTokens: jest.fn(),
}));

const mockCacheIncr = jest.fn(async () => 1);
const mockCacheExpire = jest.fn(async () => {});
await jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  cacheIncr: mockCacheIncr,
  cacheExpire: mockCacheExpire,
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheGetBuffer: jest.fn(),
  cacheSetBuffer: jest.fn(),
  cacheTtl: jest.fn(),
  evalScript: jest.fn(),
  redis: null,
  redisAvailable: false,
  isRedisAvailable: jest.fn().mockReturnValue(false),
=======
  verifyAccess:  mockVerifyAccess,
  issueTokens:   jest.fn(),
  refreshTokens: jest.fn(),
}));

const mockCacheIncr   = jest.fn(async () => 1);
const mockCacheExpire = jest.fn(async () => {});
await jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  cacheIncr:   mockCacheIncr,
  cacheExpire: mockCacheExpire,
  cacheGet:    jest.fn(), cacheSet:    jest.fn(),
  cacheDel:    jest.fn(), cacheGetBuffer: jest.fn(),
  cacheSetBuffer: jest.fn(), cacheTtl: jest.fn(),
  evalScript:  jest.fn(), redis: null, redisAvailable: false,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

await jest.unstable_mockModule('../../src/core/metrics.js', () => ({
  rateLimitCounter: { inc: jest.fn() },
<<<<<<< HEAD
  errorCounter: { inc: jest.fn() },
  pipelineLatency: { observe: jest.fn() },
  register: { metrics: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
=======
  errorCounter:     { inc: jest.fn() },
  pipelineLatency:  { observe: jest.fn() },
  register:         { metrics: jest.fn() },
}));

await jest.unstable_mockModule('../../src/services/observability.js', () => ({
  recordStageSpan: jest.fn((_s, _a, fn) => fn(null)),
  STAGES: { WHISPER: 'whisper', CLAUDE: 'claude', OLLAMA: 'ollama', TTS: 'tts', AGENT: 'agent.pipeline' },
  withSpan: jest.fn((_n, _a, fn) => fn(null)),
  init: jest.fn(), shutdown: jest.fn(), getTracer: jest.fn(), getMeter: jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

await jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
<<<<<<< HEAD
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
=======
  logger:      { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

const { _makeSecurity } = await import('../../src/services/security.js');

function makeSec() {
  return _makeSecurity({
<<<<<<< HEAD
    _verifyAccess: mockVerifyAccess,
    _apiKeys: ['key-a'],
    _cacheIncr: mockCacheIncr,
    _cacheExpire: mockCacheExpire,
    _rateLimitCounter: { inc: jest.fn() },
    _errorCounter: { inc: jest.fn() },
    _recordStageSpan: jest.fn((_s, _a, fn) => fn(null)),
=======
    _verifyAccess:     mockVerifyAccess,
    _apiKeys:          ['key-a'],
    _cacheIncr:        mockCacheIncr,
    _cacheExpire:      mockCacheExpire,
    _rateLimitCounter: { inc: jest.fn() },
    _errorCounter:     { inc: jest.fn() },
    _recordStageSpan:  jest.fn((_s, _a, fn) => fn(null)),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
}

function mockRes() {
  const r = { _status: null, _body: null, _headers: {} };
<<<<<<< HEAD
  r.status = s => {
    r._status = s;
    return r;
  };
  r.json = b => {
    r._body = b;
    return r;
  };
  r.setHeader = (k, v) => {
    r._headers[k] = v;
  };
=======
  r.status    = (s) => { r._status = s; return r; };
  r.json      = (b) => { r._body   = b; return r; };
  r.setHeader = (k, v) => { r._headers[k] = v; };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return r;
}

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 228: rlKey = identity.sub || req.ip || 'anon' — 'anon' right side
// ═════════════════════════════════════════════════════════════════════════════

describe('makeSecurityMiddleware — rlKey "anon" fallback (line 228)', () => {
  test('uses "anon" as rate-limit key when identity.sub and req.ip are both absent', async () => {
    // Identity has no sub field (empty string → falsy)
    mockVerifyAccess.mockReturnValue({ sub: '', role: 'user' });

    const { makeSecurityMiddleware } = makeSec();
<<<<<<< HEAD
    const mw = makeSecurityMiddleware();
    const next = jest.fn();
    const res = mockRes();
=======
    const mw   = makeSecurityMiddleware();
    const next  = jest.fn();
    const res   = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    // Request with no IP (undefined → falsy)
    const request = {
      headers: { authorization: 'Bearer tok' },
<<<<<<< HEAD
      ip: undefined, // no IP → 'anon' fallback (line 228)
=======
      ip: undefined,   // no IP → 'anon' fallback (line 228)
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    };

    await mw(request, res, next);

    // Should proceed (rate limit should allow)
    expect(next).toHaveBeenCalled();
    // cacheIncr key should be 'rl:anon:...' format
    const rlCallKey = mockCacheIncr.mock.calls[0]?.[0] ?? '';
<<<<<<< HEAD
    expect(rlCallKey).toMatch(/^rl:sec:/);
=======
    expect(rlCallKey).toMatch(/^rl:anon:/);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});
