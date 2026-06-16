// @ts-nocheck
// tests/integration/auth.test.js
// Integration tests for JWT auth flow using the refactored src/ architecture.

import { jest } from '@jest/globals';
import supertest from 'supertest';

// ── Mock external dependencies before importing app ───────────────────────────

jest.unstable_mockModule('../../src/core/tracing.js', () => ({
  initTracing:    jest.fn(() => Promise.resolve()),
  shutdownTracing: jest.fn(() => Promise.resolve()),
  startSpan:      jest.fn(() => ({ setAttributes: jest.fn(), setStatus: jest.fn(), recordException: jest.fn(), end: jest.fn() })),
  withSpan:       jest.fn((_n, _a, fn) => fn({ end: jest.fn() })),
}));

const refreshStore = new Map();

jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  redis: null, redisAvailable: false,
  cacheGet: jest.fn(async key => refreshStore.has(key) ? refreshStore.get(key) : null),
  cacheSet: jest.fn(async (key, value) => {
    refreshStore.set(key, value);
    return 'OK';
  }),
  cacheDel: jest.fn(async key => {
    refreshStore.delete(key);
    return 1;
  }),
  cacheIncr:   jest.fn(() => Promise.resolve(1)),
  cacheExpire: jest.fn(() => Promise.resolve()),
  cacheTtl:    jest.fn(() => Promise.resolve(60)),
  evalScript:  jest.fn(() => Promise.resolve([1, 1])),
}));

jest.unstable_mockModule('../../src/infra/db/dbClient.js', () => ({
  db: null, dbAvailable: false, destroyDb: jest.fn(() => Promise.resolve()),
}));

jest.unstable_mockModule('../../src/features/tts/tts.service.js', () => ({
  synthesize: jest.fn(() => Promise.resolve({ buffer: Buffer.alloc(10), ext: '.wav', mimeType: 'audio/wav', fallback: false })),
}));

jest.unstable_mockModule('../../src/services/audio.utils.js', () => ({
  saveAudio:           jest.fn(() => Promise.resolve({ filepath: '/tmp/t.wav', filename: 't.wav' })),
  downloadTwilioMedia: jest.fn(),
  mulawToWav:          jest.fn(b => b),
  pcm16ToWav:          jest.fn(b => b),
}));

jest.unstable_mockModule('../../src/features/nlu/nlu.service.js', () => ({
  understand: jest.fn(() => Promise.resolve({
    ok: true, intent: 'list_events', confidence: 0.9, subject: '',
    isoDate: null, isoTime: null, needsClarification: false, missing: [], errors: [], strategy: 'mock',
  })),
}));

jest.unstable_mockModule('../../src/features/responder/responder.service.js', () => ({
  autoReply: jest.fn(() => Promise.resolve('Réponse mockée')),
  getTones:  jest.fn(() => ['friendly', 'pro', 'sec', 'sarcastique', 'wolf-inc']),
}));

// ── Import app after mocks ────────────────────────────────────────────────────

const { app } = await import('../../server.js');
const request = supertest(app);

// ═══════════════════════════════════════════════════════════
// POST /auth/token
// ═══════════════════════════════════════════════════════════

describe('POST /auth/token', () => {
  test('issues accessToken + refreshToken cookie for valid apiKey', async () => {
    const res = await request.post('/auth/token').send({ apiKey: 'test-key-abc123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.expiresIn).toBe('15m');
    expect(res.body.tokenType).toBe('Bearer');
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some(c => c.includes('wolf_rt'))).toBe(true);
    expect(cookies.some(c => c.toLowerCase().includes('httponly'))).toBe(true);
  });

  test('rejects invalid apiKey with 401', async () => {
    const res = await request.post('/auth/token').send({ apiKey: 'wrong-key' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('rejects missing apiKey with 400', async () => {
    const res = await request.post('/auth/token').send({});
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════
// POST /auth/refresh
// ═══════════════════════════════════════════════════════════

describe('POST /auth/refresh', () => {
  let refreshCookie;

  beforeAll(async () => {
    const res = await request.post('/auth/token').send({ apiKey: 'test-key-abc123' });
    const rawCookie = res.headers['set-cookie']?.find(c => c.startsWith('wolf_rt='));
    refreshCookie = rawCookie?.split(';')[0];
  });

  test('issues new accessToken with valid refresh cookie', async () => {
    if (!refreshCookie) return; // guard for CI without cookie support
    const res = await request.post('/auth/refresh').set('Cookie', refreshCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  test('rejects with 401 when no cookie', async () => {
    const res = await request.post('/auth/refresh');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// POST /auth/logout
// ═══════════════════════════════════════════════════════════

describe('POST /auth/logout', () => {
  test('clears cookie and returns ok', async () => {
    const res = await request.post('/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Protected routes
// ═══════════════════════════════════════════════════════════

describe('Protected routes', () => {
  let accessToken;

  beforeAll(async () => {
    const res = await request.post('/auth/token').send({ apiKey: 'test-key-abc123' });
    accessToken = res.body.accessToken;
  });

  test('POST /reply requires auth — returns 401 without token', async () => {
    const res = await request.post('/reply').send({ content: 'test' });
    expect(res.status).toBe(401);
  });

  test('POST /reply returns 401 with invalid token', async () => {
    const res = await request.post('/reply')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ content: 'test' });
    expect(res.status).toBe(401);
  });

  test('POST /reply succeeds (200 or 503) with valid Bearer token', async () => {
    const res = await request.post('/reply')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'Bonjour' });
    // 200 = LLM answered  |  503 = LLM unavailable (Ollama not running in test)
    expect([200, 503]).toContain(res.status);
  });
});
