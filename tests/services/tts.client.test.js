// tests/services/tts.client.test.js
// Full test suite for tts.client.js — circuit breaker, retry, timeout, metrics.
// Uses _makeSynthesize factory with clock-injectable breakers (no fake timers needed).

import { jest } from '@jest/globals';

// ── Mock external dependencies BEFORE any imports ─────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(),
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
  }),
}));

// Config — mutable plain object; individual tests can override TTS_PROVIDER.
jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    TTS_PROVIDER:       'elevenlabs',
    ELEVENLABS_API_KEY: 'el-test-key',
    ELEVENLABS_VOICE_ID:'21m00Tcm4TlvDq8ikWAM',
    AZURE_TTS_KEY:      'azure-test-key',
    AZURE_TTS_REGION:   'eastus',
    AZURE_TTS_VOICE:    'fr-FR-DeniseNeural',
  },
}));

const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordRequest:   jest.fn(),
  recordFailure:   jest.fn(),
  recordLatency:   jest.fn(),
  setCircuitState: jest.fn(),
}));

const mockSynthesizeMock = jest.fn(async () => Buffer.alloc(44, 0));
jest.unstable_mockModule('../../src/features/tts/providers/mock.js', () => ({
  synthesizeMock: mockSynthesizeMock,
}));

const mockSynthesizePiper = jest.fn(async () => Buffer.alloc(44, 1));
jest.unstable_mockModule('../../src/features/tts/providers/piper.js', () => ({
  synthesizePiper: mockSynthesizePiper,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const { _makeSynthesize }                                            = await import('../../src/services/tts.client.js');
const { CircuitBreaker, CircuitOpenError, TimeoutError, HttpError }  = await import('../../src/services/circuitBreaker.js');
const metrics                                                         = await import('../../src/services/metrics.js');
const { config }                                                      = await import('../../src/core/config.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Valid WAV/audio ArrayBuffer returned by arrayBuffer() mock. */
const fakeAudio = () => new ArrayBuffer(100);

/** Simulate a successful audio HTTP response. */
function okAudioResponse() {
  return {
    ok:          true,
    status:      200,
    arrayBuffer: async () => fakeAudio(),
    text:        async () => 'ok',
  };
}

/** Simulate a successful plain-text response (Azure token). */
function okTextResponse(body = 'bearer-token-xyz') {
  return {
    ok:          true,
    status:      200,
    text:        async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

/** Simulate an HTTP error response. */
function errResponse(status, body = 'error') {
  return {
    ok:          false,
    status,
    text:        async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

/** apiFetch that blocks until its AbortSignal fires. */
const hangFn = (_url, opts) =>
  new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () =>
      reject(new DOMException('Aborted', 'AbortError')),
    );
  });

/**
 * Create a test-scoped TTS client with clock injection.
 * Uses ElevenLabs by default (single apiFetch call — simpler for CB tests).
 *
 * @param {object} [breakerOverrides]  Merged into CircuitBreaker opts.
 * @param {object} [retryOverrides]    Fast retries in tests (baseMs=1, maxMs=5).
 */
function makeClient(breakerOverrides = {}, retryOverrides = {}) {
  let fakeNow = 1_000_000;
  const cb = new CircuitBreaker('tts-test', {
    failureThreshold:   5,
    errorRateThreshold: 0.5,
    minCalls:           10,
    windowMs:           60_000,
    openDurationMs:     10_000,
    now: () => fakeNow,
    ...breakerOverrides,
  });
  const synthesize = _makeSynthesize(cb, { maxRetries: 2, baseMs: 1, maxMs: 5, ...retryOverrides });
  const advance    = (ms) => { fakeNow += ms; };
  return { synthesize, cb, advance };
}

// ── Reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
  mockSynthesizeMock.mockReset();
  mockSynthesizePiper.mockReset();
  config.TTS_PROVIDER = 'elevenlabs'; // restore default
});

// ═══════════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Input validation', () => {
  test('rejects empty string', async () => {
    const { synthesize } = makeClient();
    await expect(synthesize('')).rejects.toThrow('[TTS] Empty text');
  });

  test('rejects whitespace-only string', async () => {
    const { synthesize } = makeClient();
    await expect(synthesize('   ')).rejects.toThrow('[TTS] Empty text');
  });

  test('rejects null / undefined', async () => {
    const { synthesize } = makeClient();
    await expect(synthesize(null)).rejects.toThrow('[TTS] Empty text');
    await expect(synthesize(undefined)).rejects.toThrow('[TTS] Empty text');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ElevenLabs backend — happy path
// ═══════════════════════════════════════════════════════════════════════════════

describe('ElevenLabs backend', () => {
  test('returns { buffer, ext, mimeType } on success', async () => {
    const { synthesize } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    const result = await synthesize('Bonjour monde', { requestId: 'req-el-1' });
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.ext).toBe('.mp3');
    expect(result.mimeType).toBe('audio/mpeg');
  });

  test('sends xi-api-key and Accept:audio/mpeg headers', async () => {
    const { synthesize } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    await synthesize('test');
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.headers['xi-api-key']).toBe('el-test-key');
    expect(opts.headers.Accept).toBe('audio/mpeg');
  });

  test('sends text in request body', async () => {
    const { synthesize } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    await synthesize('Rendez-vous demain');
    const [, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.text).toBe('Rendez-vous demain');
  });

  test('passes AbortSignal to apiFetch', async () => {
    const { synthesize } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    await synthesize('test', { requestId: 'req-signal' });
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Azure backend — two-step flow
// ═══════════════════════════════════════════════════════════════════════════════

describe('Azure backend', () => {
  beforeEach(() => { config.TTS_PROVIDER = 'azure'; });

  test('makes two apiFetch calls (token + synthesis) and returns MP3', async () => {
    const { synthesize } = makeClient();
    mockApiFetch
      .mockResolvedValueOnce(okTextResponse('my-token'))  // token request
      .mockResolvedValueOnce(okAudioResponse());           // synthesis
    const result = await synthesize('Bonjour', { locale: 'fr-FR' });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(result.ext).toBe('.mp3');
    expect(result.mimeType).toBe('audio/mpeg');
  });

  test('sends Bearer token in Authorization header of synthesis request', async () => {
    const { synthesize } = makeClient();
    mockApiFetch
      .mockResolvedValueOnce(okTextResponse('tok-abc'))
      .mockResolvedValueOnce(okAudioResponse());
    await synthesize('test', { locale: 'fr-FR' });
    const [, synthOpts] = mockApiFetch.mock.calls[1];
    expect(synthOpts.headers.Authorization).toBe('Bearer tok-abc');
  });

  test('throws HttpError when token request fails', async () => {
    const { synthesize } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(401, 'Unauthorized'));
    await expect(synthesize('test')).rejects.toBeInstanceOf(HttpError);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  test('throws HttpError when synthesis request fails', async () => {
    const { synthesize } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch
      .mockResolvedValueOnce(okTextResponse('token'))
      .mockResolvedValueOnce(errResponse(503, 'Service unavailable'));
    await expect(synthesize('test')).rejects.toBeInstanceOf(HttpError);
  });

  test('passes AbortSignal to both token and synthesis requests', async () => {
    const { synthesize } = makeClient();
    mockApiFetch
      .mockResolvedValueOnce(okTextResponse('tok'))
      .mockResolvedValueOnce(okAudioResponse());
    await synthesize('test');
    const [, tokenOpts] = mockApiFetch.mock.calls[0];
    const [, synthOpts] = mockApiFetch.mock.calls[1];
    expect(tokenOpts.signal).toBeInstanceOf(AbortSignal);
    expect(synthOpts.signal).toBeInstanceOf(AbortSignal);
    // Both calls share the same AbortController signal
    expect(tokenOpts.signal).toBe(synthOpts.signal);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Local backends — bypass circuit breaker
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mock backend', () => {
  beforeEach(() => { config.TTS_PROVIDER = 'mock'; });

  test('returns WAV buffer without calling apiFetch', async () => {
    const { synthesize } = makeClient();
    mockSynthesizeMock.mockResolvedValueOnce(Buffer.alloc(44, 0));
    const result = await synthesize('Bonjour');
    expect(result.ext).toBe('.wav');
    expect(result.mimeType).toBe('audio/wav');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('circuit breaker state is unaffected by mock calls', async () => {
    const { synthesize, cb } = makeClient();
    mockSynthesizeMock.mockResolvedValue(Buffer.alloc(44, 0));
    for (let i = 0; i < 10; i++) await synthesize(`text ${i}`);
    expect(cb.getState()).toBe('CLOSED');
    expect(cb._consecutiveFailures).toBe(0);
  });
});

describe('Piper backend', () => {
  beforeEach(() => { config.TTS_PROVIDER = 'piper'; });

  test('returns WAV buffer without calling apiFetch', async () => {
    const { synthesize } = makeClient();
    mockSynthesizePiper.mockResolvedValueOnce(Buffer.alloc(44, 1));
    const result = await synthesize('Bonjour');
    expect(result.ext).toBe('.wav');
    expect(result.mimeType).toBe('audio/wav');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Timeout
// ═══════════════════════════════════════════════════════════════════════════════

describe('Timeout', () => {
  test('throws TimeoutError when backend hangs past timeoutMs', async () => {
    const { synthesize } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    await expect(synthesize('test', { timeoutMs: 20 })).rejects.toBeInstanceOf(TimeoutError);
  });

  test('timeout is recorded as a breaker failure', async () => {
    const { synthesize, cb } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    await expect(synthesize('test', { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    expect(cb._consecutiveFailures).toBe(1);
  });

  test('records "timeout" status and reason in metrics', async () => {
    const { synthesize } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    await expect(synthesize('test', { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    expect(metrics.recordRequest).toHaveBeenCalledWith('tts', 'timeout');
    expect(metrics.recordFailure).toHaveBeenCalledWith('tts', 'timeout');
  });

  test('repeated timeouts open the circuit', async () => {
    const { synthesize, cb } = makeClient({ failureThreshold: 3 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    for (let i = 0; i < 3; i++) {
      await expect(synthesize('test', { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    }
    expect(cb.getState()).toBe('OPEN');
  });

  test('fast response does not trigger timeout', async () => {
    const { synthesize } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    const result = await synthesize('fast', { timeoutMs: 5_000 });
    expect(result.ext).toBe('.mp3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Retry on 5xx
// ═══════════════════════════════════════════════════════════════════════════════

describe('Retry on 5xx', () => {
  test('retries on 503 and returns result on second attempt', async () => {
    const { synthesize } = makeClient({ failureThreshold: 10 });
    mockApiFetch
      .mockResolvedValueOnce(errResponse(503, 'unavailable'))
      .mockResolvedValueOnce(okAudioResponse());
    const result = await synthesize('test');
    expect(result.ext).toBe('.mp3');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  test('retries up to maxRetries then throws HttpError', async () => {
    const { synthesize } = makeClient({ failureThreshold: 10 });
    mockApiFetch.mockResolvedValue(errResponse(502, 'bad gateway'));
    await expect(synthesize('test')).rejects.toBeInstanceOf(HttpError);
    expect(mockApiFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test('records http_5xx failure reason in metrics after final failure', async () => {
    const { synthesize } = makeClient({ failureThreshold: 10 });
    mockApiFetch.mockResolvedValue(errResponse(500, 'error'));
    await expect(synthesize('test')).rejects.toBeInstanceOf(HttpError);
    expect(metrics.recordFailure).toHaveBeenCalledWith('tts', 'http_5xx');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// No retry on 4xx
// ═══════════════════════════════════════════════════════════════════════════════

describe('No retry on 4xx', () => {
  test.each([400, 401, 403, 404, 422, 429])(
    'does NOT retry on HTTP %i — apiFetch called exactly once',
    async (status) => {
      const { synthesize } = makeClient({ failureThreshold: 10 });
      mockApiFetch.mockResolvedValueOnce(errResponse(status));
      await expect(synthesize('test')).rejects.toBeInstanceOf(HttpError);
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    },
  );

  test('records http_4xx failure reason in metrics', async () => {
    const { synthesize } = makeClient({ failureThreshold: 10 });
    mockApiFetch.mockResolvedValueOnce(errResponse(422));
    await expect(synthesize('test')).rejects.toBeInstanceOf(HttpError);
    expect(metrics.recordFailure).toHaveBeenCalledWith('tts', 'http_4xx');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Circuit breaker: CLOSED → OPEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker: CLOSED → OPEN', () => {
  test('opens after failureThreshold consecutive exec failures', async () => {
    const { synthesize, cb } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');
  });

  test('rejects immediately with CircuitOpenError when OPEN (apiFetch never called)', async () => {
    const { synthesize } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();

    mockApiFetch.mockReset();
    await expect(synthesize('test')).rejects.toBeInstanceOf(CircuitOpenError);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('records circuit_open status and reason in metrics', async () => {
    const { synthesize } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    jest.clearAllMocks();

    await expect(synthesize('test')).rejects.toBeInstanceOf(CircuitOpenError);
    expect(metrics.recordRequest).toHaveBeenCalledWith('tts', 'circuit_open');
    expect(metrics.recordFailure).toHaveBeenCalledWith('tts', 'circuit_open');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Circuit breaker: HALF_OPEN → CLOSED (probe success)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker: HALF_OPEN → CLOSED', () => {
  test('transitions OPEN → HALF_OPEN → CLOSED on successful probe', async () => {
    const { synthesize, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');

    advance(10_001);

    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    const result = await synthesize('probe text', { requestId: 'probe-req' });
    expect(result.ext).toBe('.mp3');
    expect(cb.getState()).toBe('CLOSED');
  });

  test('resets consecutive failures counter to 0 after probe success', async () => {
    const { synthesize, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    await synthesize('probe');
    expect(cb._consecutiveFailures).toBe(0);
    expect(cb._halfOpenProbeInFlight).toBe(false);
  });

  test('records success metrics after probe', async () => {
    const { synthesize, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    advance(10_001);

    jest.clearAllMocks();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    await synthesize('probe');
    expect(metrics.recordRequest).toHaveBeenCalledWith('tts', 'success');
    expect(metrics.recordLatency).toHaveBeenCalledWith('tts', expect.any(Number));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Circuit breaker: HALF_OPEN → OPEN (probe failure)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker: HALF_OPEN → OPEN (probe failure)', () => {
  test('re-opens on probe failure and resets timer', async () => {
    const { synthesize, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    advance(10_001);

    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('probe')).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');
    expect(cb._halfOpenProbeInFlight).toBe(false);
  });

  test('circuit remains OPEN immediately after probe failure (timer reset)', async () => {
    const { synthesize, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('probe')).rejects.toThrow();

    mockApiFetch.mockReset();
    await expect(synthesize('next')).rejects.toBeInstanceOf(CircuitOpenError);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('recovers fully after second open + wait + successful probe', async () => {
    const { synthesize, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    // First open
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    advance(10_001);

    // Probe fails → re-open
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('probe1')).rejects.toThrow();

    // Wait again
    advance(10_001);

    // Successful probe → CLOSED
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    const result = await synthesize('probe2');
    expect(result.ext).toBe('.mp3');
    expect(cb.getState()).toBe('CLOSED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Circuit breaker: concurrent probe race in HALF_OPEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker: concurrent probe race', () => {
  test('second concurrent call in HALF_OPEN gets CircuitOpenError immediately', async () => {
    const { synthesize, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    advance(10_001);

    // Slow probe — apiFetch hangs until we resolve it
    let resolveApiFetch;
    mockApiFetch.mockImplementationOnce(
      () => new Promise(r => { resolveApiFetch = () => r(okAudioResponse()); }),
    );

    const probe1 = synthesize('slow-probe');  // starts → _halfOpenProbeInFlight = true
    const probe2 = synthesize('concurrent');  // must be blocked immediately

    await expect(probe2).rejects.toBeInstanceOf(CircuitOpenError);

    resolveApiFetch();
    const result = await probe1;
    expect(result.ext).toBe('.mp3');
  });

  test('_halfOpenProbeInFlight resets to false after successful probe', async () => {
    const { synthesize, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    await synthesize('probe');
    expect(cb._halfOpenProbeInFlight).toBe(false);
    expect(cb.getState()).toBe('CLOSED');
  });

  test('_halfOpenProbeInFlight resets to false after failed probe', async () => {
    const { synthesize, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('probe')).rejects.toThrow();
    expect(cb._halfOpenProbeInFlight).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requestId propagation
// ═══════════════════════════════════════════════════════════════════════════════

describe('requestId propagation', () => {
  test('succeeds end-to-end with a requestId option', async () => {
    const { synthesize } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    const result = await synthesize('Bonjour', { requestId: 'req-abc-789' });
    expect(result.ext).toBe('.mp3');
  });

  test('passes AbortSignal from circuit breaker to apiFetch', async () => {
    const { synthesize } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    await synthesize('test', { requestId: 'req-signal' });
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  test('concurrent clients with different requestIds do not interfere', async () => {
    const { synthesize: s1 } = makeClient();
    const { synthesize: s2 } = makeClient();
    mockApiFetch
      .mockResolvedValueOnce(okAudioResponse())
      .mockResolvedValueOnce(okAudioResponse());
    const [r1, r2] = await Promise.all([
      s1('text one', { requestId: 'r1' }),
      s2('text two', { requestId: 'r2' }),
    ]);
    expect(r1.ext).toBe('.mp3');
    expect(r2.ext).toBe('.mp3');
  });

  test('locale option is forwarded (Azure sends it in SSML)', async () => {
    config.TTS_PROVIDER = 'azure';
    const { synthesize } = makeClient();
    mockApiFetch
      .mockResolvedValueOnce(okTextResponse('tok'))
      .mockResolvedValueOnce(okAudioResponse());
    await synthesize('Bonjour', { locale: 'en-US', requestId: 'req-locale' });
    const [, synthOpts] = mockApiFetch.mock.calls[1];
    expect(synthOpts.body).toContain('en-US');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Prometheus metrics
// ═══════════════════════════════════════════════════════════════════════════════

describe('Prometheus metrics', () => {
  test('records success metrics on happy path', async () => {
    const { synthesize } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    await synthesize('Bonjour');
    expect(metrics.recordRequest).toHaveBeenCalledWith('tts', 'success');
    expect(metrics.recordLatency).toHaveBeenCalledWith('tts', expect.any(Number));
    expect(metrics.recordFailure).not.toHaveBeenCalled();
  });

  test('records error metrics on 5xx failure', async () => {
    const { synthesize } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(synthesize('test')).rejects.toThrow();
    expect(metrics.recordRequest).toHaveBeenCalledWith('tts', 'error');
    expect(metrics.recordFailure).toHaveBeenCalledWith('tts', 'http_5xx');
    expect(metrics.recordLatency).toHaveBeenCalledWith('tts', expect.any(Number));
  });

  test('calls setCircuitState on factory creation', () => {
    makeClient();
    expect(metrics.setCircuitState).toHaveBeenCalledWith('tts-test', 'CLOSED');
  });

  test('latency is a non-negative number', async () => {
    const { synthesize } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAudioResponse());
    await synthesize('test');
    const [, latency] = metrics.recordLatency.mock.calls[0];
    expect(latency).toBeGreaterThanOrEqual(0);
  });

  test('does not call recordRequest/recordFailure for mock backend', async () => {
    config.TTS_PROVIDER = 'mock';
    const { synthesize } = makeClient();
    mockSynthesizeMock.mockResolvedValueOnce(Buffer.alloc(44));
    await synthesize('test');
    expect(metrics.recordRequest).not.toHaveBeenCalled();
    expect(metrics.recordFailure).not.toHaveBeenCalled();
    expect(metrics.recordLatency).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// res.text().catch(() => '') — fires when body is unreadable on error response
// ═════════════════════════════════════════════════════════════════════════════

describe('_elevenlabs — res.text().catch(() => "") (line 59)', () => {
  test('catch handler fires when text() rejects on non-ok elevenlabs response', async () => {
    config.TTS_PROVIDER = 'elevenlabs';
    const { synthesize } = makeClient({ failureThreshold: 100 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce({
      ok: false, status: 500,
      text: jest.fn().mockRejectedValueOnce(new Error('unreadable')),
    });
    await expect(synthesize('test', {})).rejects.toThrow('ElevenLabs 500');
  });
});

describe('_azure — res.text().catch(() => "") (lines 84, 106)', () => {
  beforeEach(() => { config.TTS_PROVIDER = 'azure'; });

  test('catch handler fires when token request text() rejects (line 84)', async () => {
    const { synthesize } = makeClient({ failureThreshold: 100 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce({
      ok: false, status: 401,
      text: jest.fn().mockRejectedValueOnce(new Error('unreadable')),
    });
    await expect(synthesize('test', {})).rejects.toThrow('Azure token 401');
  });

  test('catch handler fires when TTS synthesis text() rejects (line 106)', async () => {
    const { synthesize } = makeClient({ failureThreshold: 100 }, { maxRetries: 0 });
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValueOnce('tok') })
      .mockResolvedValueOnce({
        ok: false, status: 500,
        text: jest.fn().mockRejectedValueOnce(new Error('unreadable')),
      });
    await expect(synthesize('test', {})).rejects.toThrow('Azure TTS 500');
  });
});
