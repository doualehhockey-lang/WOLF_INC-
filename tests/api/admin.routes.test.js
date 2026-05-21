// tests/api/admin.routes.test.js
// Admin API surface: authentication gate (401 without token), correct HTTP
// status codes and response shapes with a valid JWT, and request-body passthrough.
// All external I/O (Redis, DB, TTS, NLU, tracing) is mocked so the tests
// run without real infrastructure.

import { jest }     from '@jest/globals';
import supertest    from 'supertest';
import { createHmac } from 'node:crypto';

// ── Infrastructure mocks (must be declared before app import) ─────────────────

jest.unstable_mockModule('../../src/core/tracing.js', () => ({
  initTracing:     jest.fn(() => Promise.resolve()),
  shutdownTracing: jest.fn(() => Promise.resolve()),
  startSpan:       jest.fn(() => ({
    setAttributes: jest.fn(), setStatus: jest.fn(),
    recordException: jest.fn(), end: jest.fn(),
  })),
  withSpan: jest.fn((_n, _a, fn) => fn({ end: jest.fn() })),
}));

jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  redis: null, redisAvailable: false,
  cacheGet:    jest.fn(async () => null),
  cacheSet:    jest.fn(async () => {}),
  cacheDel:    jest.fn(async () => {}),
  cacheIncr:   jest.fn(async () => 1),
  cacheExpire: jest.fn(async () => {}),
  cacheTtl:    jest.fn(async () => -1),
  evalScript:  jest.fn(async () => [1, 1]),
}));

jest.unstable_mockModule('../../src/infra/db/dbClient.js', () => ({
  db: null, dbAvailable: false, destroyDb: jest.fn(() => Promise.resolve()),
}));

jest.unstable_mockModule('../../src/features/tts/tts.service.js', () => ({
  synthesize: jest.fn(async () => ({
    buffer: Buffer.alloc(10), ext: '.wav', mimeType: 'audio/wav', fallback: false,
  })),
}));

jest.unstable_mockModule('../../src/services/audio.utils.js', () => ({
  saveAudio:           jest.fn(async () => ({ filepath: '/tmp/t.wav', filename: 't.wav' })),
  downloadTwilioMedia: jest.fn(),
  mulawToWav:          jest.fn(b => b),
  pcm16ToWav:          jest.fn(b => b),
}));

jest.unstable_mockModule('../../src/features/nlu/nlu.service.js', () => ({
  understand: jest.fn(async () => ({
    ok: true, intent: 'list_events', confidence: 0.9,
    subject: '', isoDate: null, isoTime: null,
    needsClarification: false, missing: [], errors: [], strategy: 'mock',
  })),
}));

jest.unstable_mockModule('../../src/features/responder/responder.service.js', () => ({
  autoReply: jest.fn(async () => 'OK'),
  getTones:  jest.fn(() => ['friendly']),
}));

jest.unstable_mockModule('../../src/features/agent/agent.service.js', () => ({
  dispatch: jest.fn(async () => ({ ok: true, message: 'Mock response.' })),
}));

// ── Import app and JWT signer AFTER mocks ─────────────────────────────────────
const { createApp }    = await import('../../src/api/server.js');
const { default: jwt } = await import('jsonwebtoken');

// ── JWT helpers ───────────────────────────────────────────────────────────────
// Matches the JWT_SECRET set in tests/setup.js global setup.
const JWT_SECRET = process.env.JWT_SECRET ?? 'testjwtsecret__padding__1234567890abcdef';

function makeToken(payload = {}) {
  return jwt.sign({ sub: 'test-user', role: 'admin', ...payload }, JWT_SECRET, { expiresIn: '1h' });
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// ── App instance (shared across tests) ────────────────────────────────────────
const app     = createApp();
const request = supertest(app);

// ── Route table for matrix tests ──────────────────────────────────────────────
const ADMIN_ROUTES = [
  { method: 'get',    path: '/admin/users' },
  { method: 'post',   path: '/admin/users' },
  { method: 'put',    path: '/admin/users/u1' },
  { method: 'delete', path: '/admin/users/u1' },
  { method: 'get',    path: '/admin/api-keys' },
  { method: 'post',   path: '/admin/api-keys' },
  { method: 'delete', path: '/admin/api-keys/k1' },
  { method: 'get',    path: '/admin/security-logs' },
  { method: 'post',   path: '/admin/deploy/canary' },
  { method: 'post',   path: '/admin/deploy/promote' },
  { method: 'post',   path: '/admin/deploy/rollback' },
  { method: 'get',    path: '/admin/k8s/pods' },
  { method: 'get',    path: '/admin/k8s/hpa' },
  { method: 'get',    path: '/admin/observability/grafana/panels' },
];

// ═════════════════════════════════════════════════════════════════════════════
// 1. Authentication gate — 401 on all routes without a token
// ═════════════════════════════════════════════════════════════════════════════

describe('Admin routes — unauthenticated (no token)', () => {
  test.each(ADMIN_ROUTES)(
    '$method $path → 401',
    async ({ method, path }) => {
      const res = await request[method](path);
      expect(res.status).toBe(401);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Authentication gate — 401 on malformed / expired tokens
// ═════════════════════════════════════════════════════════════════════════════

describe('Admin routes — malformed token', () => {
  test('GET /admin/users with garbage token → 401', async () => {
    const res = await request.get('/admin/users')
      .set({ Authorization: 'Bearer not-a-real-jwt' });
    expect(res.status).toBe(401);
  });

  test('GET /admin/users with expired token → 401', async () => {
    const token = jwt.sign({ sub: 'u', role: 'admin' }, JWT_SECRET, { expiresIn: '-1s' });
    const res = await request.get('/admin/users').set(authHeader(token));
    expect(res.status).toBe(401);
  });

  test('GET /admin/users with wrong secret → 401', async () => {
    const token = jwt.sign({ sub: 'u', role: 'admin' }, 'wrong-secret');
    const res = await request.get('/admin/users').set(authHeader(token));
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. User management endpoints
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /admin/users', () => {
  test('returns 200 with valid JWT', async () => {
    const res = await request.get('/admin/users').set(authHeader(makeToken()));
    expect(res.status).toBe(200);
  });

  test('response body has users array', async () => {
    const res = await request.get('/admin/users').set(authHeader(makeToken()));
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
  });
});

describe('POST /admin/users', () => {
  test('returns 201 when creating a new user', async () => {
    const res = await request.post('/admin/users')
      .set(authHeader(makeToken()))
      .send({ name: 'Alice', email: 'alice@example.com' });
    expect(res.status).toBe(201);
  });

  test('response body echoes the sent payload', async () => {
    const payload = { name: 'Bob', email: 'bob@example.com' };
    const res = await request.post('/admin/users')
      .set(authHeader(makeToken()))
      .send(payload);
    expect(res.body.name).toBe('Bob');
    expect(res.body.email).toBe('bob@example.com');
  });

  test('response body includes an id', async () => {
    const res = await request.post('/admin/users')
      .set(authHeader(makeToken()))
      .send({ name: 'Carol' });
    expect(res.body).toHaveProperty('id');
  });
});

describe('PUT /admin/users/:id', () => {
  test('returns 200 for a valid update request', async () => {
    const res = await request.put('/admin/users/u_abc')
      .set(authHeader(makeToken()))
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
  });

  test('response body reflects the provided id', async () => {
    const res = await request.put('/admin/users/u_xyz')
      .set(authHeader(makeToken()))
      .send({ name: 'X' });
    expect(res.body.id).toBe('u_xyz');
  });
});

describe('DELETE /admin/users/:id', () => {
  test('returns 204 with no body', async () => {
    const res = await request.delete('/admin/users/u_del')
      .set(authHeader(makeToken()));
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. API key management endpoints
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /admin/api-keys', () => {
  test('returns 200 and keys array', async () => {
    const res = await request.get('/admin/api-keys').set(authHeader(makeToken()));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.keys)).toBe(true);
  });
});

describe('POST /admin/api-keys', () => {
  test('returns 201 and includes id in response', async () => {
    const res = await request.post('/admin/api-keys')
      .set(authHeader(makeToken()))
      .send({ label: 'CI Bot' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});

describe('DELETE /admin/api-keys/:id', () => {
  test('returns 204 with no content', async () => {
    const res = await request.delete('/admin/api-keys/k_old')
      .set(authHeader(makeToken()));
    expect(res.status).toBe(204);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Security logs
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /admin/security-logs', () => {
  test('returns 200 with events array and total', async () => {
    const res = await request.get('/admin/security-logs').set(authHeader(makeToken()));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('events');
    expect(res.body).toHaveProperty('total');
    expect(typeof res.body.total).toBe('number');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Deployment controls
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /admin/deploy/canary', () => {
  test('returns 200 with ok:true and tag echoed', async () => {
    const res = await request.post('/admin/deploy/canary')
      .set(authHeader(makeToken()))
      .send({ tag: 'sha-abc123' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tag).toBe('sha-abc123');
  });
});

describe('POST /admin/deploy/promote', () => {
  test('returns 200 with ok:true', async () => {
    const res = await request.post('/admin/deploy/promote')
      .set(authHeader(makeToken()))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /admin/deploy/rollback', () => {
  test('returns 200 with ok:true and tag echoed', async () => {
    const res = await request.post('/admin/deploy/rollback')
      .set(authHeader(makeToken()))
      .send({ tag: 'sha-prev' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tag).toBe('sha-prev');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Kubernetes endpoints
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /admin/k8s/pods', () => {
  test('returns 200 with an array', async () => {
    const res = await request.get('/admin/k8s/pods').set(authHeader(makeToken()));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /admin/k8s/hpa', () => {
  test('returns 200 with an array', async () => {
    const res = await request.get('/admin/k8s/hpa').set(authHeader(makeToken()));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Observability
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /admin/observability/grafana/panels', () => {
  test('returns 200 with panels object', async () => {
    const res = await request.get('/admin/observability/grafana/panels')
      .set(authHeader(makeToken()));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('panels');
  });
});
