// tests/api/router.branches.test.js
// Covers router.js remaining branch gaps:
//   Line 41:  /health/ready → 503 when heapPct > 0.95
//   Lines 64-65: /reply catch block when autoReply throws

import { jest }  from '@jest/globals';
import supertest from 'supertest';

// ── Infrastructure mocks ──────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/tracing.js', () => ({
  initTracing:     jest.fn(async () => {}),
  shutdownTracing: jest.fn(async () => {}),
  startSpan:       jest.fn(() => ({ setAttributes: jest.fn(), setStatus: jest.fn(), recordException: jest.fn(), end: jest.fn() })),
  withSpan:        jest.fn((_n, _a, fn) => fn({ end: jest.fn() })),
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
  db: null, dbAvailable: false, destroyDb: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../src/features/tts/tts.service.js', () => ({
  synthesize: jest.fn(async () => ({ buffer: Buffer.alloc(10), ext: '.wav', mimeType: 'audio/wav' })),
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

const mockAutoReply = jest.fn(async () => 'Reply text');
const mockGetTones  = jest.fn(() => ['friendly']);
jest.unstable_mockModule('../../src/features/responder/responder.service.js', () => ({
  autoReply: mockAutoReply,
  getTones:  mockGetTones,
}));

jest.unstable_mockModule('../../src/features/agent/agent.service.js', () => ({
  dispatch: jest.fn(async () => ({ ok: true, message: 'Ok' })),
}));

// ── Import app and JWT after mocks ────────────────────────────────────────────

const { createApp }    = await import('../../src/api/server.js');
const { default: jwt } = await import('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET ?? 'testjwtsecret__padding__1234567890abcdef';
const token = jwt.sign({ sub: 'test-user', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

let app;
beforeAll(async () => {
  app = await createApp();
});

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 41: /health/ready → 503 when heap usage > 95%
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /health/ready — memory pressure 503 (line 41)', () => {
  test('returns 503 degraded when heapUsed/heapTotal > 0.95', async () => {
    // Spy on process.memoryUsage to simulate high memory pressure
    const spy = jest.spyOn(process, 'memoryUsage').mockReturnValue({
      heapUsed:    960_000_000,   // 96% used
      heapTotal:   1_000_000_000,
      rss:         1_500_000_000,
      external:    0,
      arrayBuffers: 0,
    });

    const res = await supertest(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.reason).toBe('memory_pressure');

    spy.mockRestore();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 64-65: /reply catch block when autoReply throws
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /reply — autoReply error catch (lines 64-65)', () => {
  test('passes error to next() when autoReply throws', async () => {
    mockAutoReply.mockRejectedValueOnce(new Error('autoReply boom'));

    const res = await supertest(app)
      .post('/reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'test message', tone: 'friendly' });

    // The error handler should return a 500
    expect([500, 502, 503]).toContain(res.status);
  });
});
