// @ts-nocheck
// tests/services/ollama.client.test.js
// Full test suite for ollama.client.js — circuit breaker, retry, timeout, metrics.
// Uses _makeOllamaClient factory with clock-injectable breakers (no fake timers needed).

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

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    OLLAMA_URL:     'http://localhost:11434',
    OLLAMA_MODEL:   'llama3.2:3b',
    OLLAMA_TIMEOUT: 120_000,
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

const { _makeOllamaClient }                                          = await import('../../src/services/ollama.client.js');
const { CircuitBreaker, CircuitOpenError, TimeoutError, HttpError }  = await import('../../src/services/circuitBreaker.js');
const metrics                                                         = await import('../../src/services/metrics.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simulate a successful Ollama chat response. */
function okChatResponse(content = 'Bonjour!') {
  return {
    ok:   true,
    status: 200,
    json: async () => ({ message: { role: 'assistant', content }, done: true }),
    text: async () => JSON.stringify({ message: { content }, done: true }),
  };
}

/** Simulate a successful Ollama analyze response (returns valid NLU JSON). */
function okAnalyzeResponse(nlu = {}) {
  const defaults = { intent: 'list_events', subject: '', date: 'demain', time: '', confidence: 0.9, errors: [], strategy: 'ollama' };
  const content  = JSON.stringify({ ...defaults, ...nlu });
  return okChatResponse(content);
}

/** Simulate an HTTP error response. */
function errResponse(status, body = 'error') {
  return {
    ok:     false,
    status,
    text:   async () => body,
    json:   async () => { throw new Error('not JSON'); },
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
 * Create a test-scoped Ollama client with clock injection.
 *
 * @param {object} [breakerOverrides]  Merged into CircuitBreaker opts.
 * @param {object} [retryOverrides]    Fast retries in tests (baseMs=1, maxMs=5).
 */
function makeClient(breakerOverrides = {}, retryOverrides = {}) {
  let fakeNow = 1_000_000;
  const cb = new CircuitBreaker('ollama-test', {
    failureThreshold:   5,
    errorRateThreshold: 0.5,
    minCalls:           10,
    windowMs:           60_000,
    openDurationMs:     10_000,
    now: () => fakeNow,
    ...breakerOverrides,
  });
  const client  = _makeOllamaClient(cb, { maxRetries: 2, baseMs: 1, maxMs: 5, ...retryOverrides });
  const advance = (ms) => { fakeNow += ms; };
  return { ...client, cb, advance };
}

// ── Reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
});

// ═══════════════════════════════════════════════════════════════════════════════
// chat() — happy path
// ═══════════════════════════════════════════════════════════════════════════════

describe('chat() — happy path', () => {
  test('returns assistant reply content as a trimmed string', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('  Bonjour monde  '));
    expect(await chat([{ role: 'user', content: 'test' }])).toBe('Bonjour monde');
  });

  test('returns empty string when response has no message content', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ done: true }), // no .message
      text: async () => '{}',
    });
    expect(await chat([])).toBe('');
  });

  test('POSTs to /api/chat with correct Content-Type', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    await chat([{ role: 'user', content: 'hello' }]);
    const [url, opts] = mockApiFetch.mock.calls[0];
    expect(url).toContain('/api/chat');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  test('includes model, stream:false and options in body', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    await chat([{ role: 'user', content: 'hello' }], { model: 'custom-model', temperature: 0.3 });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.model).toBe('custom-model');
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0.3);
  });

  test('passes AbortSignal from circuit breaker to apiFetch', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    await chat([{ role: 'user', content: 'test' }], { requestId: 'req-signal' });
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// chat() — timeout
// ═══════════════════════════════════════════════════════════════════════════════

describe('chat() — timeout', () => {
  test('throws TimeoutError when Ollama does not respond in time', async () => {
    const { chat } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    await expect(chat([], { timeoutMs: 20 })).rejects.toBeInstanceOf(TimeoutError);
  });

  test('timeout counts as a consecutive breaker failure', async () => {
    const { chat, cb } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    await expect(chat([], { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    expect(cb._consecutiveFailures).toBe(1);
  });

  test('records "timeout" status and reason in metrics', async () => {
    const { chat } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    await expect(chat([], { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    expect(metrics.recordRequest).toHaveBeenCalledWith('ollama', 'timeout');
    expect(metrics.recordFailure).toHaveBeenCalledWith('ollama', 'timeout');
  });

  test('repeated timeouts open the circuit', async () => {
    const { chat, cb } = makeClient({ failureThreshold: 3 }, { maxRetries: 0 });
    mockApiFetch.mockImplementation(hangFn);
    for (let i = 0; i < 3; i++) {
      await expect(chat([], { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    }
    expect(cb.getState()).toBe('OPEN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// chat() — retry on 5xx
// ═══════════════════════════════════════════════════════════════════════════════

describe('chat() — retry on 5xx', () => {
  test('retries on 503 and returns result on second attempt', async () => {
    const { chat } = makeClient({ failureThreshold: 10 });
    mockApiFetch
      .mockResolvedValueOnce(errResponse(503, 'unavailable'))
      .mockResolvedValueOnce(okChatResponse('success'));
    expect(await chat([])).toBe('success');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  test('retries up to maxRetries then throws HttpError', async () => {
    const { chat } = makeClient({ failureThreshold: 10 });
    mockApiFetch.mockResolvedValue(errResponse(502, 'bad gateway'));
    await expect(chat([])).rejects.toBeInstanceOf(HttpError);
    expect(mockApiFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test('records http_5xx failure reason on final failure', async () => {
    const { chat } = makeClient({ failureThreshold: 10 });
    mockApiFetch.mockResolvedValue(errResponse(500, 'internal error'));
    await expect(chat([])).rejects.toBeInstanceOf(HttpError);
    expect(metrics.recordFailure).toHaveBeenCalledWith('ollama', 'http_5xx');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// chat() — no retry on 4xx
// ═══════════════════════════════════════════════════════════════════════════════

describe('chat() — no retry on 4xx', () => {
  test.each([400, 401, 403, 404, 422, 429])(
    'does NOT retry on HTTP %i — apiFetch called exactly once',
    async (status) => {
      const { chat } = makeClient({ failureThreshold: 10 });
      mockApiFetch.mockResolvedValueOnce(errResponse(status));
      await expect(chat([])).rejects.toBeInstanceOf(HttpError);
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    },
  );

  test('records http_4xx failure reason in metrics', async () => {
    const { chat } = makeClient({ failureThreshold: 10 });
    mockApiFetch.mockResolvedValueOnce(errResponse(422));
    await expect(chat([])).rejects.toBeInstanceOf(HttpError);
    expect(metrics.recordFailure).toHaveBeenCalledWith('ollama', 'http_4xx');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// chat() — circuit breaker: CLOSED → OPEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('chat() — circuit breaker: CLOSED → OPEN', () => {
  test('opens after failureThreshold consecutive exec failures', async () => {
    const { chat, cb } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');
  });

  test('rejects immediately with CircuitOpenError when OPEN (apiFetch not called)', async () => {
    const { chat } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();

    mockApiFetch.mockReset();
    await expect(chat([])).rejects.toBeInstanceOf(CircuitOpenError);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('records circuit_open status and reason in metrics', async () => {
    const { chat } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    jest.clearAllMocks();

    await expect(chat([])).rejects.toBeInstanceOf(CircuitOpenError);
    expect(metrics.recordRequest).toHaveBeenCalledWith('ollama', 'circuit_open');
    expect(metrics.recordFailure).toHaveBeenCalledWith('ollama', 'circuit_open');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// chat() — circuit breaker: HALF_OPEN → CLOSED (probe success)
// ═══════════════════════════════════════════════════════════════════════════════

describe('chat() — circuit breaker: HALF_OPEN → CLOSED', () => {
  test('transitions OPEN → HALF_OPEN → CLOSED on successful probe', async () => {
    const { chat, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');

    advance(10_001);

    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    expect(await chat([{ role: 'user', content: 'probe' }], { requestId: 'probe-req' })).toBe('ok');
    expect(cb.getState()).toBe('CLOSED');
  });

  test('resets consecutive failures counter and probe flag after success', async () => {
    const { chat, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    await chat([]);
    expect(cb._consecutiveFailures).toBe(0);
    expect(cb._halfOpenProbeInFlight).toBe(false);
  });

  test('records success metrics after probe', async () => {
    const { chat, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    advance(10_001);

    jest.clearAllMocks();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    await chat([]);
    expect(metrics.recordRequest).toHaveBeenCalledWith('ollama', 'success');
    expect(metrics.recordLatency).toHaveBeenCalledWith('ollama', expect.any(Number));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// chat() — circuit breaker: HALF_OPEN → OPEN (probe failure)
// ═══════════════════════════════════════════════════════════════════════════════

describe('chat() — circuit breaker: HALF_OPEN → OPEN (probe failure)', () => {
  test('re-opens on probe failure and resets timer', async () => {
    const { chat, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    advance(10_001);

    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');
    expect(cb._halfOpenProbeInFlight).toBe(false);
  });

  test('circuit remains OPEN immediately after probe failure (timer reset)', async () => {
    const { chat, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();

    mockApiFetch.mockReset();
    await expect(chat([])).rejects.toBeInstanceOf(CircuitOpenError);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('full recovery: second open → wait → probe success → CLOSED', async () => {
    const { chat, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });

    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    advance(10_001);

    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow(); // re-opens

    advance(10_001);
    mockApiFetch.mockResolvedValueOnce(okChatResponse('recovered'));
    expect(await chat([])).toBe('recovered');
    expect(cb.getState()).toBe('CLOSED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// chat() — concurrent probe race in HALF_OPEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('chat() — concurrent probe race', () => {
  test('second concurrent call in HALF_OPEN gets CircuitOpenError immediately', async () => {
    const { chat, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    advance(10_001);

    let resolveProbe;
    mockApiFetch.mockImplementationOnce(
      () => new Promise(r => { resolveProbe = () => r(okChatResponse('done')); }),
    );

    const probe1 = chat([{ role: 'user', content: 'slow' }]);   // probe in-flight
    const probe2 = chat([{ role: 'user', content: 'blocked' }]); // must be blocked

    await expect(probe2).rejects.toBeInstanceOf(CircuitOpenError);

    resolveProbe();
    expect(await probe1).toBe('done');
  });

  test('_halfOpenProbeInFlight resets after concurrent probe resolves', async () => {
    const { chat, cb, advance } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    advance(10_001);

    let resolveProbe;
    mockApiFetch.mockImplementationOnce(
      () => new Promise(r => { resolveProbe = () => r(okChatResponse('ok')); }),
    );
    const probe1  = chat([]);
    const probe2  = chat([]); // blocked — rejects with CircuitOpenError (handled below)
    await expect(probe2).rejects.toBeInstanceOf(CircuitOpenError);
    resolveProbe();
    await probe1;
    expect(cb._halfOpenProbeInFlight).toBe(false);
    expect(cb.getState()).toBe('CLOSED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requestId propagation
// ═══════════════════════════════════════════════════════════════════════════════

describe('requestId propagation', () => {
  test('succeeds end-to-end with a requestId option', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('réponse'));
    expect(await chat([], { requestId: 'req-xyz' })).toBe('réponse');
  });

  test('AbortSignal is an AbortSignal instance', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    await chat([], { requestId: 'req-sig' });
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  test('concurrent clients with different requestIds do not interfere', async () => {
    const { chat: c1 } = makeClient();
    const { chat: c2 } = makeClient();
    mockApiFetch
      .mockResolvedValueOnce(okChatResponse('one'))
      .mockResolvedValueOnce(okChatResponse('two'));
    const [r1, r2] = await Promise.all([
      c1([], { requestId: 'r1' }),
      c2([], { requestId: 'r2' }),
    ]);
    expect(r1).toBe('one');
    expect(r2).toBe('two');
  });

  test('custom model in opts is forwarded to request body', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    await chat([], { model: 'mistral:7b', requestId: 'req-model' });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.model).toBe('mistral:7b');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// analyze() — happy path
// ═══════════════════════════════════════════════════════════════════════════════

describe('analyze() — happy path', () => {
  test('returns parsed NLU object on valid JSON response', async () => {
    const { analyze } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAnalyzeResponse({ intent: 'create_event', confidence: 0.95 }));
    const result = await analyze('réunion demain');
    expect(result.intent).toBe('create_event');
    expect(result.confidence).toBe(0.95);
    expect(result.strategy).toBe('ollama');
  });

  test('returns error fallback for empty text without calling apiFetch', async () => {
    const { analyze } = makeClient();
    const result = await analyze('');
    expect(result.intent).toBe('unknown');
    expect(result.strategy).toBe('none');
    expect(result.errors).toContain('empty-input');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('returns error fallback for whitespace-only text', async () => {
    const { analyze } = makeClient();
    const result = await analyze('   ');
    expect(result.strategy).toBe('none');
  });

  test('strips markdown code fences before JSON parse', async () => {
    const { analyze } = makeClient();
    const nlu   = { intent: 'list_events', subject: '', date: '', time: '', confidence: 0.8, errors: [], strategy: 'ollama' };
    const fenced = `\`\`\`json\n${JSON.stringify(nlu)}\n\`\`\``;
    mockApiFetch.mockResolvedValueOnce(okChatResponse(fenced));
    const result = await analyze('liste mes RDV');
    expect(result.intent).toBe('list_events');
  });

  test('normalises missing fields with safe defaults', async () => {
    const { analyze } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('{"intent":"cancel_event"}'));
    const result = await analyze('annule');
    expect(result.subject).toBe('');
    expect(result.date).toBe('');
    expect(result.time).toBe('');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// analyze() — error resilience (NEVER throws)
// ═══════════════════════════════════════════════════════════════════════════════

describe('analyze() — error resilience', () => {
  test('returns ollama-error fallback when JSON parse fails', async () => {
    const { analyze } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('not valid json {{{'));
    const result = await analyze('hello');
    expect(result.intent).toBe('unknown');
    expect(result.strategy).toBe('ollama-error');
    expect(result.errors).toContain('parse-failed');
  });

  test('returns ollama-error fallback when circuit breaker is OPEN', async () => {
    const { analyze } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await analyze('first call opens breaker'); // opens CB silently via catch

    const result = await analyze('second call — CB open');
    expect(result.intent).toBe('unknown');
    expect(result.strategy).toBe('ollama-error');
    expect(mockApiFetch).toHaveBeenCalledTimes(1); // second call never reached apiFetch
  });

  test('returns ollama-error fallback on network error', async () => {
    const { analyze } = makeClient({ failureThreshold: 10 }, { maxRetries: 0 });
    mockApiFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await analyze('test');
    expect(result.strategy).toBe('ollama-error');
    expect(result.errors[0]).toContain('ECONNREFUSED');
  });

  test('NEVER throws — always returns a valid NLU object', async () => {
    const { analyze } = makeClient({ failureThreshold: 1 }, { maxRetries: 0 });
    mockApiFetch.mockRejectedValue(new Error('catastrophic failure'));
    const result = await analyze('anything');
    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('strategy');
    expect(result).toHaveProperty('errors');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Prometheus metrics
// ═══════════════════════════════════════════════════════════════════════════════

describe('Prometheus metrics', () => {
  test('records success metrics on happy path', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    await chat([]);
    expect(metrics.recordRequest).toHaveBeenCalledWith('ollama', 'success');
    expect(metrics.recordLatency).toHaveBeenCalledWith('ollama', expect.any(Number));
    expect(metrics.recordFailure).not.toHaveBeenCalled();
  });

  test('records error metrics on 5xx failure', async () => {
    const { chat } = makeClient({ failureThreshold: 99 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce(errResponse(503));
    await expect(chat([])).rejects.toThrow();
    expect(metrics.recordRequest).toHaveBeenCalledWith('ollama', 'error');
    expect(metrics.recordFailure).toHaveBeenCalledWith('ollama', 'http_5xx');
    expect(metrics.recordLatency).toHaveBeenCalledWith('ollama', expect.any(Number));
  });

  test('calls setCircuitState on factory creation', () => {
    makeClient();
    expect(metrics.setCircuitState).toHaveBeenCalledWith('ollama-test', 'CLOSED');
  });

  test('latency observation is a non-negative number', async () => {
    const { chat } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okChatResponse('ok'));
    await chat([]);
    const [, latency] = metrics.recordLatency.mock.calls[0];
    expect(latency).toBeGreaterThanOrEqual(0);
  });

  test('analyze() success does NOT double-record metrics (only chat() records)', async () => {
    const { analyze } = makeClient();
    mockApiFetch.mockResolvedValueOnce(okAnalyzeResponse());
    await analyze('liste mes rendez-vous');
    // Only one recordRequest call (from chat() inside analyze())
    expect(metrics.recordRequest).toHaveBeenCalledTimes(1);
    expect(metrics.recordRequest).toHaveBeenCalledWith('ollama', 'success');
  });

  test('res.text().catch(() => "") fires when text() rejects on non-ok response (line 120)', async () => {
    const { chat } = makeClient({ failureThreshold: 100 }, { maxRetries: 0 });
    mockApiFetch.mockResolvedValueOnce({
      ok: false, status: 503,
      text: jest.fn().mockRejectedValueOnce(new Error('body unreadable')),
    });
    await expect(chat([{ role: 'user', content: 'test' }])).rejects.toThrow('Ollama 503');
  });
});
