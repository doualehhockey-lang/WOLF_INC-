// tests/integration/twilio.test.js
// Integration tests for Twilio webhook routes — refactored src/ architecture.
// Uses supertest for real HTTP requests. Mocks external I/O only.

import { jest } from '@jest/globals';
import supertest from 'supertest';

// ── Mock external dependencies before importing app ───────────────────────────

jest.unstable_mockModule('../../src/core/tracing.js', () => ({
  initTracing:    jest.fn(() => Promise.resolve()),
  shutdownTracing: jest.fn(() => Promise.resolve()),
  startSpan:      jest.fn(() => ({ setAttributes: jest.fn(), setStatus: jest.fn(), recordException: jest.fn(), end: jest.fn() })),
  withSpan:       jest.fn((_n, _a, fn) => fn({ end: jest.fn() })),
}));

jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  redis: null, redisAvailable: false,
  cacheGet:    jest.fn(() => Promise.resolve(null)),
  cacheSet:    jest.fn(() => Promise.resolve()),
  cacheDel:    jest.fn(() => Promise.resolve()),
  cacheIncr:   jest.fn(() => Promise.resolve(1)),
  cacheExpire: jest.fn(() => Promise.resolve()),
  cacheTtl:    jest.fn(() => Promise.resolve(60)),
  evalScript:  jest.fn(() => Promise.resolve([1, 1])), // [count, allowed=1]
}));

jest.unstable_mockModule('../../src/infra/db/dbClient.js', () => ({
  db: null, dbAvailable: false, destroyDb: jest.fn(() => Promise.resolve()),
}));

jest.unstable_mockModule('../../src/features/tts/tts.service.js', () => ({
  synthesize: jest.fn(() => Promise.resolve({
    buffer: Buffer.alloc(100), ext: '.wav', mimeType: 'audio/wav', fallback: false,
  })),
}));

jest.unstable_mockModule('../../src/services/audio.utils.js', () => ({
  saveAudio:           jest.fn(() => Promise.resolve({ filepath: '/tmp/test.wav', filename: 'test.wav' })),
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

jest.unstable_mockModule('../../src/features/agent/agent.service.js', () => ({
  dispatch: jest.fn(() => Promise.resolve({ ok: true, message: 'Vous n\'avez aucun rendez-vous.' })),
}));

// ── Import app after mocks ────────────────────────────────────────────────────

const { app } = await import('../../server.js');
const request = supertest(app);

// ═══════════════════════════════════════════════════════════
// Health checks
// ═══════════════════════════════════════════════════════════

describe('Health endpoints', () => {
  test('GET /health/live → 200 ok', async () => {
    const res = await request.get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /health/ready → 200 ok', async () => {
    const res = await request.get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ═══════════════════════════════════════════════════════════
// GET /tones
// ═══════════════════════════════════════════════════════════

describe('GET /tones', () => {
  test('returns list of tones', async () => {
    const res = await request.get('/tones');
    expect(res.status).toBe(200);
    expect(res.body.tones).toContain('friendly');
    expect(res.body.tones).toContain('pro');
  });
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/voice
// ═══════════════════════════════════════════════════════════

describe('POST /twilio/voice', () => {
  test('returns TwiML with Gather on valid call', async () => {
    const res = await request.post('/twilio/voice')
      .send({ CallSid: 'CA_test_voice', From: '+33600000001' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<Gather');
  });

  test('returns 200 even with minimal body (defaults applied)', async () => {
    const res = await request.post('/twilio/voice').send({});
    expect(res.status).toBe(200);
    expect(res.text).toContain('<?xml');
  });
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/gather
// ═══════════════════════════════════════════════════════════

describe('POST /twilio/gather', () => {
  test('processes speech and returns TwiML', async () => {
    const res = await request.post('/twilio/gather').send({
      CallSid: 'CA_gather_test', From: '+33600000002',
      SpeechResult: 'liste mes rendez-vous', Confidence: '0.95',
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
  });

  test('detects English locale in TwiML', async () => {
    const res = await request.post('/twilio/gather').send({
      CallSid: 'CA_gather_en', From: '+33600000020',
      SpeechResult: 'Please list my appointments tomorrow', Confidence: '0.97',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('language="en-US"');
  });

  test('detects Spanish locale in TwiML', async () => {
    const res = await request.post('/twilio/gather').send({
      CallSid: 'CA_gather_es', From: '+33600000021',
      SpeechResult: 'Hola, muéstrame mis citas por favor', Confidence: '0.92',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('language="es-ES"');
  });

  test('detects Arabic locale in TwiML', async () => {
    const res = await request.post('/twilio/gather').send({
      CallSid: 'CA_gather_ar', From: '+33600000022',
      SpeechResult: 'مرحبا، أريد معرفة مواعيدي', Confidence: '0.95',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('language="ar-SA"');
  });

  test('handles empty SpeechResult gracefully', async () => {
    const res = await request.post('/twilio/gather').send({
      CallSid: 'CA_empty_speech', From: '+33600000003',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('<?xml');
  });
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/status
// ═══════════════════════════════════════════════════════════

describe('POST /twilio/status', () => {
  test('returns 204 on call completed', async () => {
    const res = await request.post('/twilio/status')
      .send({ CallSid: 'CA_status_test', CallStatus: 'completed' });
    expect(res.status).toBe(204);
  });

  test('returns 204 on call failed', async () => {
    const res = await request.post('/twilio/status')
      .send({ CallSid: 'CA_fail_test', CallStatus: 'failed' });
    expect(res.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/sms
// ═══════════════════════════════════════════════════════════

describe('POST /twilio/sms', () => {
  test('returns XML response for valid SMS', async () => {
    const res = await request.post('/twilio/sms')
      .send({ From: '+33600000004', Body: 'Bonjour' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<Response>');
  });

  test('returns empty response for blank SMS body', async () => {
    const res = await request.post('/twilio/sms').send({ From: '+33600000005' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Response>');
  });
});

// ═══════════════════════════════════════════════════════════
// GET /metrics
// ═══════════════════════════════════════════════════════════

describe('GET /metrics', () => {
  test('returns Prometheus metrics', async () => {
    const res = await request.get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('wolf_');
  });
});

// ═══════════════════════════════════════════════════════════
// GET /twilio/health
// ═══════════════════════════════════════════════════════════

describe('GET /twilio/health', () => {
  test('returns 200 with ok:true and config info', async () => {
    const res = await request.get('/twilio/health');
    expect(res.status).toBe(200);
    // The TwiML headers middleware sets Content-Type: text/xml on all routes.
    // handleHealth sends JSON, but content-type may be text/xml.
    // Parse the text body to verify the JSON content:
    const body = JSON.parse(res.text || '{}');
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty('timestamp');
  });
});
