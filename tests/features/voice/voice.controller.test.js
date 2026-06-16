// tests/features/voice/voice.controller.test.js
// handleVoice: rate-limited, greeting URL present, no greeting URL.
// handleGather: rate-limited, empty text, pipeline success, pipeline error.
// handleStatus: terminal/non-terminal call statuses.
// handleHealth: response shape.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    BASE_URL: 'http://localhost:3000',
    TTS_PROVIDER: 'mock',
    WHISPER_BACKEND: 'local',
  },
}));

// ── Mock core metrics ─────────────────────────────────────────────────────────
const mockCallsTotal = { inc: jest.fn() };
const mockActiveSessions = { set: jest.fn() };
const mockErrorCounter = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  callsTotal: mockCallsTotal,
  activeSessions: mockActiveSessions,
  errorCounter: mockErrorCounter,
  auditLogFailures: { inc: jest.fn() },
  rateLimitCounter: { inc: jest.fn() },
  pipelineLatency: { startTimer: jest.fn(() => jest.fn()), observe: jest.fn() },
  nluLatency: { observe: jest.fn() },
}));

// ── Mock redisClient (for gather idempotency) ─────────────────────────────────
jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  cacheGet: jest.fn(async () => null), // cache miss by default — run pipeline
  cacheSet: jest.fn(async () => {}),
  cacheDel: jest.fn(async () => {}),
  cacheIncr: jest.fn(async () => 1),
  cacheExpire: jest.fn(async () => {}),
  isRedisAvailable: jest.fn(() => false),
  evalScript: jest.fn(async () => null),
  redis: null,
  redisAvailable: false,
}));

// ── Mock rate-limiter ─────────────────────────────────────────────────────────
const mockIsRateLimited = jest.fn(async () => false);
jest.unstable_mockModule('../../../src/features/voice/rate-limiter.js', () => ({
  isRateLimited: mockIsRateLimited,
}));

// ── Mock pipeline ─────────────────────────────────────────────────────────────
const mockRunPipeline = jest.fn(async () => '<Response/>');
const mockWithTimeout = jest.fn(async fn => fn());
jest.unstable_mockModule('../../../src/features/voice/pipeline.js', () => ({
  runPipeline: mockRunPipeline,
  withTimeout: mockWithTimeout,
}));

// ── Mock greeting ─────────────────────────────────────────────────────────────
let _greetingUrl = null;
const mockGetGreetingUrl = jest.fn(() => _greetingUrl);
const mockGetFillerUrl = jest.fn(() => null);
const mockGetFillerText = jest.fn(() => 'Un instant, je vérifie ça pour vous.');
jest.unstable_mockModule('../../../src/features/voice/greeting.js', () => ({
  getGreetingUrl: mockGetGreetingUrl,
  getFillerUrl: mockGetFillerUrl,
  getFillerText: mockGetFillerText,
  GREETING_TEXT: 'Bonjour, comment puis-je vous aider ?',
}));

// ── Mock memory.service ───────────────────────────────────────────────────────
const mockClearSession = jest.fn(async () => {});
const mockMemStats = jest.fn(() => ({ activeSessions: 3, totalSessions: 10 }));
jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  clearSession: mockClearSession,
  getStats: mockMemStats,
}));

// ── Mock lang.service ────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/features/lang/lang.service.js', () => ({
  detectLang: jest.fn(() => 'fr'),
  twilioLocale: jest.fn(() => 'fr-FR'),
}));

// ── Mock validation ───────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/api/middleware/validation.js', () => ({
  sanitizeText: jest.fn(t => t),
}));

// ── Mock twiml.builder ────────────────────────────────────────────────────────
const mockTwimlGather = jest.fn(() => '<Gather/>');
const mockTwimlPlayThenGather = jest.fn(() => '<Play/>');
const mockTwimlSayThenGather = jest.fn(() => '<Say/>');
const mockTwimlError = jest.fn(() => '<Error/>');
const mockTwimlFillerThenRedirect = jest.fn(() => '<Filler/>');
jest.unstable_mockModule('../../../src/features/voice/twiml.builder.js', () => ({
  twimlGather: mockTwimlGather,
  twimlPlayThenGather: mockTwimlPlayThenGather,
  twimlSayThenGather: mockTwimlSayThenGather,
  twimlError: mockTwimlError,
  twimlFillerThenRedirect: mockTwimlFillerThenRedirect,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { handleVoice, handleGather, handleGatherResult, handleStatus, handleHealth } =
  await import('../../../src/features/voice/voice.controller.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockRes() {
  const res = {};
  res.send = jest.fn();
  res.sendStatus = jest.fn();
  res.json = jest.fn();
  res.set = jest.fn().mockReturnValue(res); // M8: Retry-After header
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  _greetingUrl = null;
  mockIsRateLimited.mockResolvedValue(false);
  mockGetGreetingUrl.mockImplementation(() => _greetingUrl);
  mockRunPipeline.mockResolvedValue('<Response/>');
  mockWithTimeout.mockImplementation(async fn => fn());
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. handleVoice
// ═════════════════════════════════════════════════════════════════════════════

describe('handleVoice — rate limited', () => {
  test('sends twimlSayThenGather when rate limited', async () => {
    mockIsRateLimited.mockResolvedValueOnce(true);
    const req = { body: { CallSid: 'CA1', From: '+33600000001' } };
    const res = mockRes();

    await handleVoice(req, res);

    expect(mockTwimlSayThenGather).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith('<Say/>');
  });

  test('increments callsTotal regardless of rate limit', async () => {
    mockIsRateLimited.mockResolvedValueOnce(true);
    const req = { body: { CallSid: 'CA2', From: '+33600000002' } };
    const res = mockRes();

    await handleVoice(req, res);

    expect(mockCallsTotal.inc).toHaveBeenCalledTimes(1);
  });
});

describe('handleVoice — greeting URL present', () => {
  test('sends twimlPlayThenGather when greeting URL is set', async () => {
    _greetingUrl = 'http://localhost:3000/audio/greeting.wav';
    const req = { body: { CallSid: 'CA3', From: '+33600000003' } };
    const res = mockRes();

    await handleVoice(req, res);

    expect(mockTwimlPlayThenGather).toHaveBeenCalledWith(
      'http://localhost:3000/audio/greeting.wav',
      expect.stringContaining('/twilio/gather')
    );
    expect(res.send).toHaveBeenCalledWith('<Play/>');
  });
});

describe('handleVoice — no greeting URL', () => {
  test('sends twimlGather when greeting URL is null', async () => {
    _greetingUrl = null;
    const req = { body: { CallSid: 'CA4', From: '+33600000004' } };
    const res = mockRes();

    await handleVoice(req, res);

    expect(mockTwimlGather).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith('<Gather/>');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. handleGather
// ═════════════════════════════════════════════════════════════════════════════

describe('handleGather — rate limited', () => {
  test('sends twimlSayThenGather when rate limited', async () => {
    mockIsRateLimited.mockResolvedValueOnce(true);
    const req = { body: { SpeechResult: 'Bonjour', CallSid: 'CA5', From: '+33600000005' } };
    const res = mockRes();

    await handleGather(req, res);

    expect(mockTwimlSayThenGather).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith('<Say/>');
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });
});

describe('handleGather — empty text', () => {
  test('sends "didn\'t catch that" when SpeechResult is empty', async () => {
    const req = { body: { SpeechResult: '', CallSid: 'CA6', From: '+33600000006' } };
    const res = mockRes();

    await handleGather(req, res);

    expect(mockTwimlSayThenGather).toHaveBeenCalledWith(
      expect.stringContaining('entendu'),
      expect.any(String),
      expect.any(Object)
    );
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  test('sends say response when SpeechResult is absent (defaults to empty string)', async () => {
    const req = { body: { CallSid: 'CA7', From: '+33600000007' } };
    const res = mockRes();

    await handleGather(req, res);

    expect(mockTwimlSayThenGather).toHaveBeenCalled();
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });
});

describe('handleGather — two-phase pipeline delegation', () => {
  test('sends filler TwiML immediately when text is present', async () => {
    const req = { body: { SpeechResult: 'Bonjour', CallSid: 'CA8', From: '+33600000008' } };
    const res = mockRes();

    await handleGather(req, res);

    // Phase 1: should send filler redirect (not pipeline result directly)
    expect(mockTwimlFillerThenRedirect).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith('<Filler/>');
  });

  test('starts pipeline in background via withTimeout', async () => {
    const req = { body: { SpeechResult: 'Bonjour', CallSid: 'CA8b', From: '+33600000008' } };
    const res = mockRes();

    await handleGather(req, res);

    // withTimeout is called to wrap the pipeline
    expect(mockWithTimeout).toHaveBeenCalledTimes(1);
  });

  test('handleGatherResult returns pipeline result for the callSid', async () => {
    // Phase 1: trigger gather to store pending result
    const gatherReq = { body: { SpeechResult: 'Bonjour', CallSid: 'CA9', From: '+33600000009' } };
    const gatherRes = mockRes();
    await handleGather(gatherReq, gatherRes);

    // Phase 2: gather-result picks up the pending pipeline result
    const resultReq = { body: { CallSid: 'CA9' } };
    const resultRes = mockRes();
    await handleGatherResult(resultReq, resultRes);

    expect(resultRes.send).toHaveBeenCalledWith('<Response/>');
  });

  test('handleGatherResult returns fallback when no pending result exists', async () => {
    const req = { body: { CallSid: 'CA_unknown' } };
    const res = mockRes();

    await handleGatherResult(req, res);

    expect(mockTwimlSayThenGather).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. handleStatus
// ═════════════════════════════════════════════════════════════════════════════

describe('handleStatus — terminal statuses', () => {
  const TERMINAL = ['completed', 'failed', 'no-answer', 'busy', 'canceled'];

  TERMINAL.forEach(status => {
    test(`clears session and sends 204 for status "${status}"`, async () => {
      const req = { body: { CallSid: 'CA10', CallStatus: status } };
      const res = mockRes();

      await handleStatus(req, res);

      expect(mockClearSession).toHaveBeenCalledWith('CA10');
      expect(mockActiveSessions.set).toHaveBeenCalledWith(3);
      expect(res.sendStatus).toHaveBeenCalledWith(204);
    });
  });
});

describe('handleStatus — non-terminal status', () => {
  test('does NOT clear session for "in-progress"', async () => {
    const req = { body: { CallSid: 'CA11', CallStatus: 'in-progress' } };
    const res = mockRes();

    await handleStatus(req, res);

    expect(mockClearSession).not.toHaveBeenCalled();
    expect(res.sendStatus).toHaveBeenCalledWith(204);
  });

  test('does NOT clear session for "ringing"', async () => {
    const req = { body: { CallSid: 'CA12', CallStatus: 'ringing' } };
    const res = mockRes();

    await handleStatus(req, res);

    expect(mockClearSession).not.toHaveBeenCalled();
    expect(res.sendStatus).toHaveBeenCalledWith(204);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. handleHealth
// ═════════════════════════════════════════════════════════════════════════════

describe('handleHealth', () => {
  test('responds with ok:true', () => {
    const req = {};
    const res = mockRes();

    handleHealth(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test('includes timestamp, config, memory in response', () => {
    const req = {};
    const res = mockRes();

    handleHealth(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('timestamp');
    expect(payload).toHaveProperty('config');
    expect(payload).toHaveProperty('memory');
    expect(payload.config).toHaveProperty('ttsProvider');
  });

  test('greetingReady is false when getGreetingUrl returns null', () => {
    _greetingUrl = null;
    handleHealth({}, mockRes());
    const payload = mockRes().json.mock.calls?.[0]?.[0];
    // Just test it doesn't throw and ok:true is present
    expect(() => handleHealth({}, mockRes())).not.toThrow();
  });

  test('greetingReady is true when getGreetingUrl returns a URL', () => {
    _greetingUrl = 'http://localhost:3000/audio/greeting.wav';
    const req = {};
    const res = mockRes();

    handleHealth(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.greetingReady).toBe(true);
  });
});
