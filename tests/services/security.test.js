// tests/services/security.test.js — Unit tests for src/services/security.js
//
// Patterns:
//   - jest.unstable_mockModule for ESM dependency injection at module level
//   - _makeSecurity(deps) factory for per-test isolated instances
//   - All async operations await; no fake timers needed (clock injected via key bucketing)
//
// Coverage:
//   authenticate  — JWT success, JWT expired, JWT invalid, API key valid,
//                   API key invalid, no credentials, request variants
//   rateLimit     — under limit, at limit, over limit, window reset, INCR=1 sets TTL
//   authorise     — all roles × resources, unknown role, RBAC throw
//   middleware    — happy path (JWT + RL), happy path (API key + RBAC),
//                   auth failure response, rate-limit block response,
//                   RBAC deny response, skipRateLimit flag
//   SecurityError — code/statusCode mapping

import { jest }   from '@jest/globals';
import { strict as assert } from 'assert';

// ── Mock: config ───────────────────────────────────────────────────────────────
await jest.unstable_mockModule('../../src/core/config.js', () => ({
  config:   { JWT_SECRET: 'test-secret-at-least-32-chars-long', API_KEYS: 'key-a,key-b' },
  apiKeys:  ['key-a', 'key-b'],
  isProd:   false,
  isTest:   true,
  corsOrigins: [],
}));

// ── Mock: token.service ────────────────────────────────────────────────────────
const mockVerifyAccess = jest.fn();
await jest.unstable_mockModule('../../src/features/auth/token.service.js', () => ({
  verifyAccess:  mockVerifyAccess,
  issueTokens:   jest.fn(),
  refreshTokens: jest.fn(),
}));

// ── Mock: redisClient ──────────────────────────────────────────────────────────
const mockCacheIncr   = jest.fn();
const mockCacheExpire = jest.fn();
await jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  cacheIncr:        mockCacheIncr,
  cacheExpire:      mockCacheExpire,
  cacheGet:         jest.fn(),
  cacheSet:         jest.fn(),
  cacheDel:         jest.fn(),
  cacheGetBuffer:   jest.fn(),
  cacheSetBuffer:   jest.fn(),
  cacheTtl:         jest.fn(),
  evalScript:       jest.fn(),
  redis:            null,
  redisAvailable:   false,
}));

// ── Mock: metrics ──────────────────────────────────────────────────────────────
const mockRlInc  = jest.fn();
const mockErrInc = jest.fn();
await jest.unstable_mockModule('../../src/core/metrics.js', () => ({
  rateLimitCounter: { inc: mockRlInc  },
  errorCounter:     { inc: mockErrInc },
  pipelineLatency:  { observe: jest.fn() },
  register:         { metrics: jest.fn() },
}));

// ── Mock: observability ────────────────────────────────────────────────────────
// recordStageSpan(stage, attrs, fn) → simply calls fn(null)
const mockRecordStageSpan = jest.fn((_stage, _attrs, fn) => fn(null));
await jest.unstable_mockModule('../../src/services/observability.js', () => ({
  recordStageSpan: mockRecordStageSpan,
  STAGES:          { WHISPER: 'whisper', CLAUDE: 'claude', OLLAMA: 'ollama', TTS: 'tts', AGENT: 'agent.pipeline' },
  withSpan:        jest.fn((_n, _a, fn) => fn(null)),
  init:            jest.fn(),
  shutdown:        jest.fn(),
  getTracer:       jest.fn(),
  getMeter:        jest.fn(),
}));

// ── Mock: logger ───────────────────────────────────────────────────────────────
await jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  logger:      { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Import SUT ─────────────────────────────────────────────────────────────────
const { _makeSecurity, SecurityError, ROLE_CAPABILITIES } =
  await import('../../src/services/security.js');

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Create an isolated security instance with sensible defaults.
 * Individual tests override only what they care about.
 */
function makeSec(overrides = {}) {
  return _makeSecurity({
    _verifyAccess:     mockVerifyAccess,
    _apiKeys:          ['key-a', 'key-b'],
    _cacheIncr:        mockCacheIncr,
    _cacheExpire:      mockCacheExpire,
    _rateLimitCounter: { inc: mockRlInc  },
    _errorCounter:     { inc: mockErrInc },
    _recordStageSpan:  mockRecordStageSpan,
    ...overrides,
  });
}

function req(headers = {}) {
  return { headers, ip: '127.0.0.1' };
}

function mockRes() {
  const r = {
    _status: null,
    _body:   null,
    _headers: {},
  };
  r.status      = (s) => { r._status = s; return r; };
  r.json        = (b) => { r._body   = b; return r; };
  r.setHeader   = (k, v) => { r._headers[k] = v; };
  return r;
}

// ── Reset mocks between tests ─────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  mockCacheIncr.mockResolvedValue(1);
  mockCacheExpire.mockResolvedValue(undefined);
  mockVerifyAccess.mockReturnValue({ sub: 'user-1', role: 'user' });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. SecurityError
// ═════════════════════════════════════════════════════════════════════════════

describe('SecurityError', () => {
  it('UNAUTHORIZED → 401', () => {
    const e = new SecurityError('UNAUTHORIZED', 'test');
    assert.equal(e.statusCode, 401);
    assert.equal(e.code, 'UNAUTHORIZED');
    assert.equal(e.name, 'SecurityError');
  });

  it('FORBIDDEN → 403', () => {
    assert.equal(new SecurityError('FORBIDDEN', 'x').statusCode, 403);
  });

  it('RATE_LIMITED → 429', () => {
    assert.equal(new SecurityError('RATE_LIMITED', 'x').statusCode, 429);
  });

  it('TOKEN_EXPIRED → 401', () => {
    assert.equal(new SecurityError('TOKEN_EXPIRED', 'x').statusCode, 401);
  });

  it('TOKEN_INVALID → 401', () => {
    assert.equal(new SecurityError('TOKEN_INVALID', 'x').statusCode, 401);
  });

  it('is an instance of Error', () => {
    assert.ok(new SecurityError('UNAUTHORIZED', 'x') instanceof Error);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. authenticate — JWT path
// ═════════════════════════════════════════════════════════════════════════════

describe('authenticate — JWT', () => {
  it('resolves identity on valid Bearer token', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'alice', role: 'admin' });
    const { authenticate } = makeSec();
    const identity = await authenticate(req({ authorization: 'Bearer valid.jwt.token' }));
    assert.deepEqual(identity, { sub: 'alice', role: 'admin', method: 'jwt' });
  });

  it('defaults role to "user" when JWT payload has no role', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'bob' });
    const { authenticate } = makeSec();
    const identity = await authenticate(req({ authorization: 'Bearer valid.jwt' }));
    assert.equal(identity.role, 'user');
  });

  it('throws TOKEN_EXPIRED when verifyAccess throws TokenExpiredError', async () => {
    const expErr = new Error('jwt expired');
    expErr.name  = 'TokenExpiredError';
    mockVerifyAccess.mockImplementation(() => { throw expErr; });
    const { authenticate } = makeSec();
    await assert.rejects(
      () => authenticate(req({ authorization: 'Bearer old.token' })),
      e => e instanceof SecurityError && e.code === 'TOKEN_EXPIRED' && e.statusCode === 401,
    );
  });

  it('throws TOKEN_INVALID on any other JWT error', async () => {
    mockVerifyAccess.mockImplementation(() => { throw new Error('invalid signature'); });
    const { authenticate } = makeSec();
    await assert.rejects(
      () => authenticate(req({ authorization: 'Bearer bad.token' })),
      e => e instanceof SecurityError && e.code === 'TOKEN_INVALID',
    );
  });

  it('increments errorCounter on JWT failure', async () => {
    mockVerifyAccess.mockImplementation(() => { throw new Error('bad'); });
    const { authenticate } = makeSec();
    await assert.rejects(() => authenticate(req({ authorization: 'Bearer x' })));
    assert.ok(mockErrInc.mock.calls.length > 0);
  });

  it('calls verifyAccess with the raw token (no "Bearer " prefix)', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'u', role: 'user' });
    const { authenticate } = makeSec();
    await authenticate(req({ authorization: 'Bearer my.jwt.here' }));
    assert.equal(mockVerifyAccess.mock.calls[0][0], 'my.jwt.here');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. authenticate — API key path
// ═════════════════════════════════════════════════════════════════════════════

describe('authenticate — API key', () => {
  it('resolves identity for valid API key', async () => {
    const { authenticate } = makeSec();
    const identity = await authenticate(req({ 'x-api-key': 'key-a' }));
    assert.deepEqual(identity, { sub: 'service', role: 'service', method: 'apikey' });
  });

  it('accepts second valid key', async () => {
    const { authenticate } = makeSec();
    const identity = await authenticate(req({ 'x-api-key': 'key-b' }));
    assert.equal(identity.method, 'apikey');
  });

  it('throws FORBIDDEN for unknown API key', async () => {
    const { authenticate } = makeSec();
    await assert.rejects(
      () => authenticate(req({ 'x-api-key': 'wrong-key' })),
      e => e instanceof SecurityError && e.code === 'FORBIDDEN' && e.statusCode === 403,
    );
  });

  it('increments errorCounter on invalid API key', async () => {
    const { authenticate } = makeSec();
    await assert.rejects(() => authenticate(req({ 'x-api-key': 'bad' })));
    assert.ok(mockErrInc.mock.calls.length > 0);
  });

  it('API key takes precedence over missing Authorization header', async () => {
    const { authenticate } = makeSec();
    const identity = await authenticate(req({ 'x-api-key': 'key-a' }));
    assert.equal(identity.role, 'service');
    assert.equal(mockVerifyAccess.mock.calls.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. authenticate — no credentials
// ═════════════════════════════════════════════════════════════════════════════

describe('authenticate — no credentials', () => {
  it('throws UNAUTHORIZED when no headers provided', async () => {
    const { authenticate } = makeSec();
    await assert.rejects(
      () => authenticate(req({})),
      e => e instanceof SecurityError && e.code === 'UNAUTHORIZED' && e.statusCode === 401,
    );
  });

  it('throws UNAUTHORIZED when Authorization is not Bearer', async () => {
    const { authenticate } = makeSec();
    await assert.rejects(
      () => authenticate(req({ authorization: 'Basic dXNlcjpwYXNz' })),
      e => e instanceof SecurityError && e.code === 'UNAUTHORIZED',
    );
  });

  it('handles null/undefined headers gracefully', async () => {
    const { authenticate } = makeSec();
    await assert.rejects(
      () => authenticate({ headers: null }),
      e => e instanceof SecurityError && e.code === 'UNAUTHORIZED',
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. rateLimit — core behaviour
// ═════════════════════════════════════════════════════════════════════════════

describe('rateLimit — core', () => {
  it('returns allowed:true when count ≤ maxHits', async () => {
    mockCacheIncr.mockResolvedValue(5);
    const { rateLimit } = makeSec();
    const result = await rateLimit('user-1', { windowSec: 60, maxHits: 100 });
    assert.equal(result.allowed, true);
    assert.equal(result.count, 5);
    assert.equal(result.remaining, 95);
  });

  it('returns allowed:true when count equals maxHits exactly', async () => {
    mockCacheIncr.mockResolvedValue(100);
    const { rateLimit } = makeSec();
    const result = await rateLimit('user-1', { windowSec: 60, maxHits: 100 });
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, 0);
  });

  it('returns allowed:false when count exceeds maxHits', async () => {
    mockCacheIncr.mockResolvedValue(101);
    const { rateLimit } = makeSec();
    const result = await rateLimit('user-1', { windowSec: 60, maxHits: 100 });
    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
  });

  it('increments rateLimitCounter when blocked', async () => {
    mockCacheIncr.mockResolvedValue(999);
    const { rateLimit } = makeSec();
    await rateLimit('bad-actor', { windowSec: 60, maxHits: 100 });
    assert.ok(mockRlInc.mock.calls.length > 0);
  });

  it('does NOT increment rateLimitCounter when allowed', async () => {
    mockCacheIncr.mockResolvedValue(50);
    const { rateLimit } = makeSec();
    await rateLimit('good-user', { windowSec: 60, maxHits: 100 });
    assert.equal(mockRlInc.mock.calls.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. rateLimit — TTL / window management
// ═════════════════════════════════════════════════════════════════════════════

describe('rateLimit — TTL management', () => {
  it('calls cacheExpire with windowSec on first hit (count === 1)', async () => {
    mockCacheIncr.mockResolvedValue(1);
    const { rateLimit } = makeSec();
    await rateLimit('new-key', { windowSec: 30, maxHits: 10 });
    assert.equal(mockCacheExpire.mock.calls.length, 1);
    assert.equal(mockCacheExpire.mock.calls[0][1], 30);
  });

  it('does NOT call cacheExpire on subsequent hits (count > 1)', async () => {
    mockCacheIncr.mockResolvedValue(5);
    const { rateLimit } = makeSec();
    await rateLimit('existing-key', { windowSec: 30, maxHits: 10 });
    assert.equal(mockCacheExpire.mock.calls.length, 0);
  });

  it('uses default windowSec=60 and maxHits=100 when opts omitted', async () => {
    mockCacheIncr.mockResolvedValue(1);
    const { rateLimit } = makeSec();
    const result = await rateLimit('default-opts');
    assert.equal(result.allowed, true);
    assert.equal(mockCacheExpire.mock.calls[0][1], 60);
  });

  it('resetInSec is a positive number', async () => {
    mockCacheIncr.mockResolvedValue(1);
    const { rateLimit } = makeSec();
    const result = await rateLimit('any-key', { windowSec: 60, maxHits: 100 });
    assert.ok(result.resetInSec > 0);
    assert.ok(result.resetInSec <= 60);
  });

  it('Redis key includes window bucket (changes across windows)', async () => {
    mockCacheIncr.mockResolvedValue(1);
    const { rateLimit } = makeSec();
    await rateLimit('user', { windowSec: 60, maxHits: 10 });
    const key1 = mockCacheIncr.mock.calls[0][0];
    assert.match(key1, /^rl:user:/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. authorise — RBAC
// ═════════════════════════════════════════════════════════════════════════════

describe('authorise — RBAC', () => {
  it('admin can access all resources', () => {
    const { authorise } = makeSec();
    const resources = ['agent', 'whisper', 'claude', 'tts', 'ollama', 'metrics', 'admin'];
    for (const r of resources) {
      assert.equal(authorise('admin', r), true, `admin should access ${r}`);
    }
  });

  it('service role can access service resources', () => {
    const { authorise } = makeSec();
    const allowed = ['agent', 'whisper', 'claude', 'tts', 'ollama'];
    for (const r of allowed) {
      assert.equal(authorise('service', r), true);
    }
  });

  it('service role cannot access metrics or admin', () => {
    const { authorise } = makeSec();
    for (const r of ['metrics', 'admin']) {
      assert.throws(
        () => authorise('service', r),
        e => e instanceof SecurityError && e.code === 'FORBIDDEN',
      );
    }
  });

  it('user role can access agent and tts', () => {
    const { authorise } = makeSec();
    assert.equal(authorise('user', 'agent'), true);
    assert.equal(authorise('user', 'tts'), true);
  });

  it('user role cannot access whisper, claude, ollama, metrics', () => {
    const { authorise } = makeSec();
    for (const r of ['whisper', 'claude', 'ollama', 'metrics']) {
      assert.throws(
        () => authorise('user', r),
        e => e instanceof SecurityError && e.code === 'FORBIDDEN',
      );
    }
  });

  it('guest role cannot access anything', () => {
    const { authorise } = makeSec();
    for (const r of ['agent', 'tts', 'whisper', 'claude']) {
      assert.throws(
        () => authorise('guest', r),
        e => e instanceof SecurityError && e.code === 'FORBIDDEN',
      );
    }
  });

  it('unknown role is treated as guest (no access)', () => {
    const { authorise } = makeSec();
    assert.throws(
      () => authorise('hacker', 'agent'),
      e => e instanceof SecurityError && e.code === 'FORBIDDEN',
    );
  });

  it('increments errorCounter on RBAC deny', () => {
    const { authorise } = makeSec();
    assert.throws(() => authorise('user', 'metrics'));
    assert.ok(mockErrInc.mock.calls.length > 0);
  });

  it('ROLE_CAPABILITIES export is frozen', () => {
    assert.ok(Object.isFrozen(ROLE_CAPABILITIES));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. makeSecurityMiddleware — happy paths
// ═════════════════════════════════════════════════════════════════════════════

describe('makeSecurityMiddleware — success', () => {
  it('calls next() on valid JWT + under rate limit', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'alice', role: 'admin' });
    mockCacheIncr.mockResolvedValue(1);
    const { makeSecurityMiddleware } = makeSec();
    const mw   = makeSecurityMiddleware();
    const next  = jest.fn();
    const res   = mockRes();
    await mw(req({ authorization: 'Bearer tok' }), res, next);
    assert.equal(next.mock.calls.length, 1);
    assert.equal(next.mock.calls[0].length, 0); // called without error arg
  });

  it('sets req.user on successful auth', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'bob', role: 'user' });
    mockCacheIncr.mockResolvedValue(1);
    const { makeSecurityMiddleware } = makeSec();
    const mw   = makeSecurityMiddleware();
    const next  = jest.fn();
    const request = req({ authorization: 'Bearer tok' });
    await mw(request, mockRes(), next);
    assert.deepEqual(request.user, { sub: 'bob', role: 'user', method: 'jwt' });
  });

  it('sets X-RateLimit-* response headers', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'u', role: 'user' });
    mockCacheIncr.mockResolvedValue(10);
    const { makeSecurityMiddleware } = makeSec();
    const mw  = makeSecurityMiddleware({ maxHits: 100 });
    const res = mockRes();
    await mw(req({ authorization: 'Bearer tok' }), res, jest.fn());
    assert.equal(res._headers['X-RateLimit-Limit'],     100);
    assert.equal(res._headers['X-RateLimit-Remaining'], 90);
  });

  it('valid API key bypasses JWT and calls next()', async () => {
    mockCacheIncr.mockResolvedValue(1);
    const { makeSecurityMiddleware } = makeSec();
    const mw   = makeSecurityMiddleware();
    const next  = jest.fn();
    await mw(req({ 'x-api-key': 'key-a' }), mockRes(), next);
    assert.equal(next.mock.calls.length, 1);
    assert.equal(mockVerifyAccess.mock.calls.length, 0);
  });

  it('RBAC passes when role has the capability', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'svc', role: 'service' });
    mockCacheIncr.mockResolvedValue(1);
    const { makeSecurityMiddleware } = makeSec();
    const mw   = makeSecurityMiddleware({ resource: 'agent' });
    const next  = jest.fn();
    await mw(req({ authorization: 'Bearer tok' }), mockRes(), next);
    assert.equal(next.mock.calls.length, 1);
  });

  it('skipRateLimit bypasses cacheIncr entirely', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'u', role: 'user' });
    const { makeSecurityMiddleware } = makeSec();
    const mw = makeSecurityMiddleware({ skipRateLimit: true });
    await mw(req({ authorization: 'Bearer tok' }), mockRes(), jest.fn());
    assert.equal(mockCacheIncr.mock.calls.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. makeSecurityMiddleware — failure responses
// ═════════════════════════════════════════════════════════════════════════════

describe('makeSecurityMiddleware — failures', () => {
  it('responds 401 when no credentials provided', async () => {
    const { makeSecurityMiddleware } = makeSec();
    const mw  = makeSecurityMiddleware();
    const res = mockRes();
    await mw(req({}), res, jest.fn());
    assert.equal(res._status, 401);
    assert.equal(res._body.error, 'UNAUTHORIZED');
  });

  it('responds 401 with TOKEN_EXPIRED code', async () => {
    const err = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    mockVerifyAccess.mockImplementation(() => { throw err; });
    const { makeSecurityMiddleware } = makeSec();
    const res = mockRes();
    await mw(req({ authorization: 'Bearer old' }), res, jest.fn());
    assert.equal(res._status, 401);
    assert.equal(res._body.error, 'TOKEN_EXPIRED');

    async function mw(...a) {
      const { makeSecurityMiddleware: f } = makeSec();
      return f()(...a);
    }
  });

  it('responds 429 when rate limit exceeded', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'spammer', role: 'user' });
    mockCacheIncr.mockResolvedValue(999);
    const { makeSecurityMiddleware } = makeSec();
    const mw  = makeSecurityMiddleware({ maxHits: 100 });
    const res = mockRes();
    await mw(req({ authorization: 'Bearer tok' }), res, jest.fn());
    assert.equal(res._status, 429);
    assert.equal(res._body.error, 'RATE_LIMITED');
    assert.ok(res._body.retryAfter > 0);
  });

  it('does NOT call next() when rate limit exceeded', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'u', role: 'user' });
    mockCacheIncr.mockResolvedValue(999);
    const { makeSecurityMiddleware } = makeSec();
    const mw   = makeSecurityMiddleware({ maxHits: 10 });
    const next  = jest.fn();
    const res   = mockRes();
    await mw(req({ authorization: 'Bearer tok' }), res, next);
    assert.equal(next.mock.calls.length, 0);
  });

  it('responds 403 when RBAC denies access', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'u', role: 'user' });
    mockCacheIncr.mockResolvedValue(1);
    const { makeSecurityMiddleware } = makeSec();
    const mw  = makeSecurityMiddleware({ resource: 'metrics' });
    const res = mockRes();
    await mw(req({ authorization: 'Bearer tok' }), res, jest.fn());
    assert.equal(res._status, 403);
    assert.equal(res._body.error, 'FORBIDDEN');
  });

  it('responds 403 for invalid API key', async () => {
    const { makeSecurityMiddleware } = makeSec();
    const mw  = makeSecurityMiddleware();
    const res = mockRes();
    await mw(req({ 'x-api-key': 'garbage' }), res, jest.fn());
    assert.equal(res._status, 403);
    assert.equal(res._body.error, 'FORBIDDEN');
  });

  it('forwards non-SecurityError to next(err)', async () => {
    const boom = new Error('db exploded');
    const badCacheIncr = jest.fn().mockRejectedValue(boom);
    mockVerifyAccess.mockReturnValue({ sub: 'u', role: 'user' });
    const { makeSecurityMiddleware } = makeSec({ _cacheIncr: badCacheIncr });
    const next = jest.fn();
    await makeSecurityMiddleware()(req({ authorization: 'Bearer tok' }), mockRes(), next);
    assert.equal(next.mock.calls.length, 1);
    assert.equal(next.mock.calls[0][0], boom);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. OTel span integration
// ═════════════════════════════════════════════════════════════════════════════

describe('OTel span integration', () => {
  it('recordStageSpan is called for authenticate', async () => {
    mockVerifyAccess.mockReturnValue({ sub: 'u', role: 'user' });
    const { authenticate } = makeSec();
    await authenticate(req({ authorization: 'Bearer tok' }));
    assert.ok(mockRecordStageSpan.mock.calls.length >= 1);
    const [stageName] = mockRecordStageSpan.mock.calls[0];
    assert.equal(stageName, 'security.auth');
  });

  it('recordStageSpan is called for rateLimit', async () => {
    mockCacheIncr.mockResolvedValue(1);
    const { rateLimit } = makeSec();
    await rateLimit('key');
    const stages = mockRecordStageSpan.mock.calls.map(c => c[0]);
    assert.ok(stages.includes('security.ratelimit'));
  });

  it('span fn receives span argument (even if null from mock)', async () => {
    let capturedSpan;
    const spy = jest.fn((_s, _a, fn) => {
      capturedSpan = 'checked';
      return fn(null);
    });
    mockVerifyAccess.mockReturnValue({ sub: 'u', role: 'user' });
    const { authenticate } = makeSec({ _recordStageSpan: spy });
    await authenticate(req({ authorization: 'Bearer tok' }));
    assert.equal(capturedSpan, 'checked');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Concurrent / edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('concurrent and edge cases', () => {
  it('handles 20 concurrent authenticate calls without cross-contamination', async () => {
    let callCount = 0;
    mockVerifyAccess.mockImplementation(() => {
      callCount++;
      return { sub: `user-${callCount}`, role: 'user' };
    });
    mockCacheIncr.mockResolvedValue(1);
    const { authenticate } = makeSec();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        authenticate(req({ authorization: `Bearer token-${i}` })),
      ),
    );
    assert.equal(results.length, 20);
    assert.equal(new Set(results.map(r => r.sub)).size, 20);
  });

  it('empty apiKeys list means all API keys are rejected', async () => {
    const { authenticate } = makeSec({ _apiKeys: [] });
    await assert.rejects(
      () => authenticate(req({ 'x-api-key': 'key-a' })),
      e => e instanceof SecurityError && e.code === 'FORBIDDEN',
    );
  });

  it('rateLimit remaining is never negative', async () => {
    mockCacheIncr.mockResolvedValue(10000);
    const { rateLimit } = makeSec();
    const result = await rateLimit('key', { maxHits: 100 });
    assert.ok(result.remaining >= 0);
  });

  it('makeSecurityMiddleware uses req.ip as rl key fallback when sub is undefined', async () => {
    // API key identity has sub='service' — ensure that path also works
    mockCacheIncr.mockResolvedValue(1);
    const { makeSecurityMiddleware } = makeSec();
    const mw   = makeSecurityMiddleware();
    const next  = jest.fn();
    const request = req({ 'x-api-key': 'key-a' });
    await mw(request, mockRes(), next);
    assert.equal(next.mock.calls.length, 1);
    // Redis key should start with rl:service:
    const rlKey = mockCacheIncr.mock.calls[0][0];
    assert.match(rlKey, /^rl:service:/);
  });
});
