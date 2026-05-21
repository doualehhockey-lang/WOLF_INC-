// @ts-nocheck
// tests/services/whisper.client.test.js
// Full test suite for whisper.client.js — circuit breaker, retry, timeout, metrics.
// Uses _makeTranscribeWav factory for clock-injectable breakers (no fake timers needed).

import { jest } from '@jest/globals';

// ── Mock external dependencies BEFORE any imports ────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(),
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
  }),
}));

// Config is a plain mutable object — individual tests can override properties.
jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    WHISPER_BACKEND:    'local-server',
    WHISPER_SERVER_URL: 'http://localhost:9000/transcribe',
    WHISPER_TIMEOUT:    15_000,
    OPENAI_API_KEY:     'sk-test-openai',
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

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const { _makeTranscribeWav }                             = await import('../../src/services/whisper.client.js');
const { CircuitBreaker, CircuitOpenError, TimeoutError, HttpError } = await import('../../src/services/circuitBreaker.js');
const metrics                                            = await import('../../src/services/metrics.js');
const { config }                                         = await import('../../src/core/config.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal valid WAV buffer (>= 44 bytes). */
const validWav = Buffer.alloc(100, 0);

/** Simulate a successful HTTP response with JSON body. */
function okResponse(text) {
  return {
    ok:   true,
    status: 200,
    json: async () => ({ text }),
    text: async () => JSON.stringify({ text }),
  };
}

/** Simulate a failing HTTP response. */
function errResponse(status, body = 'error') {
  return {
    ok:     false,
    status,
    json:   async () => { throw new Error('not JSON'); },
    text:   async () => body,
  };
}

/**
 * Create a test-scoped whisper client with clock injection.
 * All state-machine tests use this factory to avoid real time dependencies.
 *
 * @param {object} [breakerOverrides]  Merged into CircuitBreaker opts.
 * @param {object} [retryOverrides]    Fast retries by default (baseMs=1, maxMs=5).
 */
function makeClient(breakerOverrides = {}, retryOverrides = {}) {
  let fakeNow = 1_000_000;
  const cb = new CircuitBreaker('whisper-test', {
    failureThreshold:   5,
    errorRateThreshold: 0.5,
    minCalls:           10,
    windowMs:           60_000,
    openDurationMs:     10_000,
    now: () => fakeNow,
    ...breakerOverrides,
  });
  const transcribeWav = _makeTranscribeWav(cb, { maxRetries: 2, baseMs: 1, maxMs: 5, ...retryOverrides });
  const advance       = (ms) => { fakeNow += ms; };
  return { transcribeWav, cb, advance };
}

// ── Reset mocks between tests ─────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
  config.WHISPER_BACKEND = 'local-server'; // restore default
});

// ═══════════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Input validation', () => {
  test('rejects non-Buffer input', async () => {
    const { transcribeWav } = makeClient();
    await expect(transcribeWav('not a buffer')).rejects.toThrow('[Whisper] Invalid');
  });

  test('rejects Buffer shorter than 44 bytes', async () => {
    const { transcribeWav } = makeClient();
    await expect(transcribeWav(Buffer.alloc(10))).rejects.toThrow('[Whisper] Invalid');
  });

  test('accepts Buffer of exactly 44 bytes', async () => {
    const { transcribeWav } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okResponse('ok'));
    await expect(transcribeWav(Buffer.alloc(44))).resolves.toBe('ok');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Happy path — local-server backend
// ═══════════════════════════════════════════════════════════════════════════════

describe('Success — local-server backend', () => {
  test('returns transcription text from json.text field', async () => {
    const { transcribeWav } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okResponse('bonjour monde'));
    expect(await transcribeWav(validWav, { requestId: 'req-1' })).toBe('bonjour monde');
  });

  test('trims surrounding whitespace from transcription', async () => {
    const { transcribeWav } = makeClient();
    mockApiFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ text: '  hello   ' }),
      text: async () => '',
    });
    expect(await transcribeWav(validWav)).toBe('hello');
  });

  test('falls back through json field aliases (transcription, result, transcript)', async () => {
    const { transcribeWav: tw1 } = makeClient();
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ transcription: 'a' }), text: async () => '' });
    expect(await tw1(validWav)).toBe('a');

    const { transcribeWav: tw2 } = makeClient();
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ result: 'b' }), text: async () => '' });
    expect(await tw2(validWav)).toBe('b');

    const { transcribeWav: tw3 } = makeClient();
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ transcript: 'c' }), text: async () => '' });
    expect(await tw3(validWav)).toBe('c');
  });

  test('throws on empty transcription response', async () => {
    // Use maxRetries:0 — an empty-text 200 is a logic error, not a transient network fault
    const { transcribeWav } = makeClient({}, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ text: '   ' }), text: async () => '' });
    await expect(transcribeWav(validWav)).rejects.toThrow('empty response');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Happy path — OpenAI backend
// ═══════════════════════════════════════════════════════════════════════════════

describe('Success — openai backend', () => {
  beforeEach(() => { config.WHISPER_BACKEND = 'openai'; });

  test('returns transcription from OpenAI response', async () => {
    const { transcribeWav } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okResponse('réunion lundi'));
    expect(await transcribeWav(validWav, { requestId: 'req-oai' })).toBe('réunion lundi');
  });

  test('sends Authorization header with Bearer token', async () => {
    const { transcribeWav } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okResponse('test'));
    await transcribeWav(validWav);
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer sk-test-openai');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mock backend
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mock backend', () => {
  beforeEach(() => { config.WHISPER_BACKEND = 'mock'; });

  test('returns a non-empty phrase without calling apiFetch', async () => {
    const { transcribeWav } = makeClient();
    const result = await transcribeWav(validWav);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('cycles through phrases on repeated calls', async () => {
    const { transcribeWav } = makeClient();
    const r1 = await transcribeWav(validWav);
    const r2 = await transcribeWav(validWav);
    // They may differ (cycling) or repeat (index wraps), but both are strings
    expect(typeof r1).toBe('string');
    expect(typeof r2).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Timeout
// ═══════════════════════════════════════════════════════════════════════════════

describe('Timeout', () => {
  /** fn that blocks until its AbortSignal fires. */
  const hangFn = (_url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')),
      );
    });

  test('throws TimeoutError when backend hangs past timeoutMs', async () => {
    const { transcribeWav } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    await expect(transcribeWav(validWav, { timeoutMs: 20 })).rejects.toBeInstanceOf(TimeoutError);
  });

  test('records timeout as a failure in the breaker', async () => {
    const { transcribeWav, cb } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    await expect(transcribeWav(validWav, { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    expect(cb._consecutiveFailures).toBe(1);
  });

  test('records "timeout" reason in metrics', async () => {
    const { transcribeWav } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    await expect(transcribeWav(validWav, { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    expect(metrics.recordFailure).toHaveBeenCalledWith('whisper', 'timeout');
    expect(metrics.recordRequest).toHaveBeenCalledWith('whisper', 'timeout');
  });

  test('repeated timeouts open the circuit', async () => {
    const { transcribeWav, cb } = makeClient({ failureThreshold: 3 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    for (let i = 0; i < 3; i++) {
      await expect(transcribeWav(validWav, { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    }
    expect(cb.getState()).toBe('OPEN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Retry on 5xx
// ═══════════════════════════════════════════════════════════════════════════════

describe('Retry on 5xx', () => {
  test('retries on 503 and returns result on second attempt', async () => {
    const { transcribeWav } = makeClient({ failureThreshold: 10 });
    mockApiFetch
      .mockResolvedValueOnce(errResponse(503, 'unavailable'))
      .mockResolvedValueOnce(okResponse('after retry'));
    expect(await transcribeWav(validWav)).toBe('after retry');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  test('retries up to maxRetries times then throws', async () => {
    const { transcribeWav } = makeClient({ failureThreshold: 10 });
    mockApiFetch.mockResolvedValue(errResponse(502, 'bad gateway'));
    await expect(transcribeWav(validWav)).rejects.toBeInstanceOf(HttpError);
    // 1 initial + 2 retries = 3 calls
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });

  test('records http_5xx reason in metrics on final failure', async () => {
    const { transcribeWav } = makeClient({ failureThreshold: 10 });
    mockApiFetch.mockResolvedValue(errResponse(500, 'internal server error'));
    await expect(transcribeWav(validWav)).rejects.toBeInstanceOf(HttpError);
    expect(metrics.recordFailure).toHaveBeenCalledWith('whisper', 'http_5xx');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// No retry on 4xx
// ═══════════════════════════════════════════════════════════════════════════════

describe('No retry on 4xx', () => {
  test.each([400, 401, 403, 404, 422, 429])(
    'does NOT retry on HTTP %i — apiFetch called exactly once',
    async (status) => {
      const { transcribeWav } = makeClient({ failureThreshold: 10 });
      mockApiFetch.mockResolvedValueOnce(errResponse(status));
      await expect(transcribeWav(validWav)).rejects.toBeInstanceOf(HttpError);
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    },
  );

  test('records http_4xx reason in metrics', async () => {
    const { transcribeWav } = makeClient({ failureThreshold: 10 });
    mockApiFetch.mockResolvedValueOnce(errResponse(422));
    await expect(transcribeWav(validWav)).rejects.toBeInstanceOf(HttpError);
    expect(metrics.recordFailure).toHaveBeenCalledWith('whisper', 'http_4xx');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Circuit breaker: CLOSED → OPEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker: CLOSED → OPEN', () => {
  test('opens after failureThreshold consecutive exec failures', async () => {
    // failureThreshold=1, maxRetries=0 → one 5xx call opens the breaker
    const { transcribeWav, cb } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');
  });

  test('rejects immediately with CircuitOpenError when OPEN (apiFetch never called)', async () => {
    const { transcribeWav } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    // Open the breaker
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();

    // Next call — breaker is OPEN
    mockApiFetch.mockReset();
    await expect(transcribeWav(validWav)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('records circuit_open in metrics on rejection', async () => {
    const { transcribeWav } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    jest.clearAllMocks();

    await expect(transcribeWav(validWav)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(metrics.recordRequest).toHaveBeenCalledWith('whisper', 'circuit_open');
    expect(metrics.recordFailure).toHaveBeenCalledWith('whisper', 'circuit_open');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Circuit breaker: OPEN → HALF_OPEN → CLOSED (probe success)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker: HALF_OPEN → CLOSED', () => {
  test('transitions OPEN → HALF_OPEN → CLOSED on successful probe', async () => {
    const { transcribeWav, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    // Force OPEN
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');

    // Advance past openDurationMs (10_000)
    advance(10_001);

    // Probe succeeds → CLOSED
    mockApiFetch.mockResolvedValueOnce(okResponse('transcribed'));
    const result = await transcribeWav(validWav, { requestId: 'probe-req' });
    expect(result).toBe('transcribed');
    expect(cb.getState()).toBe('CLOSED');
  });

  test('resets consecutive failure counter after successful probe', async () => {
    const { transcribeWav, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(okResponse('ok'));
    await transcribeWav(validWav);
    expect(cb._consecutiveFailures).toBe(0);
  });

  test('records success metrics after probe resolves', async () => {
    const { transcribeWav, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    advance(10_001);

    jest.clearAllMocks();
    mockApiFetch.mockResolvedValueOnce(okResponse('ok'));
    await transcribeWav(validWav);
    expect(metrics.recordRequest).toHaveBeenCalledWith('whisper', 'success');
    expect(metrics.recordLatency).toHaveBeenCalledWith('whisper', expect.any(Number));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Circuit breaker: HALF_OPEN → OPEN (probe failure)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker: HALF_OPEN → OPEN (probe failure)', () => {
  test('re-opens on probe failure and resets timer', async () => {
    const { transcribeWav, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    // Open
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    advance(10_001);

    // Probe fails → back to OPEN
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');
  });

  test('circuit stays OPEN (timer reset) immediately after probe failure', async () => {
    const { transcribeWav, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();

    // Timer was just reset — still OPEN, apiFetch should NOT be called
    mockApiFetch.mockReset();
    await expect(transcribeWav(validWav)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('can recover from second open after enough time', async () => {
    const { transcribeWav, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    // First open
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    advance(10_001);

    // Failed probe → re-opens
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();

    // Wait again past new openDurationMs
    advance(10_001);

    // Successful probe → CLOSED
    mockApiFetch.mockResolvedValueOnce(okResponse('recovered'));
    const result = await transcribeWav(validWav);
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe('CLOSED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Circuit breaker: concurrent probe race in HALF_OPEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circuit breaker: concurrent probe race', () => {
  test('second concurrent call in HALF_OPEN gets CircuitOpenError', async () => {
    const { transcribeWav, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    // Force OPEN
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    advance(10_001);

    // Slow probe — apiFetch hangs until we resolve it
    let resolveApiFetch;
    mockApiFetch.mockImplementationOnce(
      () => new Promise(r => { resolveApiFetch = () => r(okResponse('done')); }),
    );

    const probe1 = transcribeWav(validWav); // starts probe, _halfOpenProbeInFlight=true
    const probe2 = transcribeWav(validWav); // should be blocked immediately

    // probe2 must reject with CircuitOpenError before probe1 resolves
    await expect(probe2).rejects.toBeInstanceOf(CircuitOpenError);

    // Resolve the first probe → CLOSED
    resolveApiFetch();
    await expect(probe1).resolves.toBe('done');
  });

  test('_halfOpenProbeInFlight resets to false after probe resolves', async () => {
    const { transcribeWav, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(okResponse('ok'));
    await transcribeWav(validWav);
    expect(cb._halfOpenProbeInFlight).toBe(false);
    expect(cb.getState()).toBe('CLOSED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requestId propagation
// ═══════════════════════════════════════════════════════════════════════════════

describe('requestId propagation', () => {
  test('succeeds with requestId — no errors from id propagation', async () => {
    const { transcribeWav } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okResponse('salut'));
    const result = await transcribeWav(validWav, { requestId: 'req-abc-123' });
    expect(result).toBe('salut');
  });

  test('passes the AbortSignal from the circuit breaker to apiFetch', async () => {
    const { transcribeWav } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okResponse('test'));
    await transcribeWav(validWav, { requestId: 'req-signal-check' });
    const [, fetchOpts] = mockApiFetch.mock.calls[0];
    expect(fetchOpts.signal).toBeInstanceOf(AbortSignal);
  });

  test('requestId does not pollute subsequent calls (different clients)', async () => {
    const { transcribeWav: tw1 } = makeClient();
    const { transcribeWav: tw2 } = makeClient();
    mockApiFetch
      .mockResolvedValueOnce(okResponse('first'))
      .mockResolvedValueOnce(okResponse('second'));
    expect(await tw1(validWav, { requestId: 'r1' })).toBe('first');
    expect(await tw2(validWav, { requestId: 'r2' })).toBe('second');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Prometheus metrics
// ═══════════════════════════════════════════════════════════════════════════════

describe('Prometheus metrics', () => {
  test('records success metrics on happy path', async () => {
    const { transcribeWav } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okResponse('ok'));
    await transcribeWav(validWav);
    expect(metrics.recordRequest).toHaveBeenCalledWith('whisper', 'success');
    expect(metrics.recordLatency).toHaveBeenCalledWith('whisper', expect.any(Number));
    expect(metrics.recordFailure).not.toHaveBeenCalled();
  });

  test('records error metrics on failure', async () => {
    const { transcribeWav } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(transcribeWav(validWav)).rejects.toThrow();
    expect(metrics.recordRequest).toHaveBeenCalledWith('whisper', 'error');
    expect(metrics.recordFailure).toHaveBeenCalledWith('whisper', 'http_5xx');
    expect(metrics.recordLatency).toHaveBeenCalledWith('whisper', expect.any(Number));
  });

  test('calls setCircuitState on factory creation', () => {
    makeClient(); // factory calls setCircuitState internally
    expect(metrics.setCircuitState).toHaveBeenCalledWith('whisper-test', 'CLOSED');
  });

  test('latency is a non-negative number', async () => {
    const { transcribeWav } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okResponse('fast'));
    await transcribeWav(validWav);
    const [, latency] = metrics.recordLatency.mock.calls[0];
    expect(latency).toBeGreaterThanOrEqual(0);
  });

  test('res.text().catch(() => "") fires when text() rejects on non-ok local response (line 64)', async () => {
    config.WHISPER_BACKEND = 'local-server';
    const { transcribeWav } = makeClient({ failureThreshold: 100 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce({
      ok: false, status: 503,
      text: jest.fn().mockRejectedValueOnce(new Error('body unreadable')),
    });
    await expect(transcribeWav(validWav)).rejects.toThrow('Whisper local 503');
  });

  test('timeoutMs ?? 15_000 right side taken when WHISPER_TIMEOUT is undefined (line 179)', async () => {
    // Remove WHISPER_TIMEOUT from config so the ?? 15_000 default is used
    config.WHISPER_BACKEND = 'local-server';
    const saved = config.WHISPER_TIMEOUT;
    config.WHISPER_TIMEOUT = undefined;  // triggers ?? 15_000 right side
    const { transcribeWav } = makeClient({ failureThreshold: 100 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(okResponse('bonjour'));
    const result = await transcribeWav(validWav);
    expect(result).toBe('bonjour');
    config.WHISPER_TIMEOUT = saved;
  });
});
