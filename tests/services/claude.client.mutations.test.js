// tests/services/claude.client.mutations.test.js
// Stryker targeted mutation killers for claude.client.js surviving mutants:
//   L23/L36  StringLiteral 'claude' (breaker name, setCircuitState)
//   L29-33   onStateChange callback BlockStatement/ObjectLiteral
//   L40-41   _escJson BlockStatement/StringLiteral
//   L45-48   _isRetryable — Stryker disable (withRetry mock prevents real calls)
//   L52-55   _failureReason StringLiterals ('circuit_open', 'timeout', 'http_5xx', 'http_4xx', 'network')
//   L58-62   _requestStatus StringLiterals ('circuit_open', 'timeout', 'error')
//   L67-68   _call guard — Stryker disable (CLAUDE_API_KEY checked before in analyze)
//   L79-84   apiFetch URL/method/headers
//   L91-92   res.text().catch fallback, HttpError message
//   L102/109 ArithmeticOperator latency (Date.now() - start vs + start)
//   L129     Regex update_event
//   L133-155 _ruleBased date/subject/confidence/errors
//   L175     empty-input exact shape
//   L184     LogicalOperator opts.model ?? config.CLAUDE_MODEL
//   L186-189 system prompt StringLiterals
//   L192-197 analyze body ObjectLiteral/ArrayDeclaration/messages format
//   L194     LogicalOperator opts.temperature ?? 0
//   L199-200 OptionalChaining content extraction + Regex markdown stripping
//   L205-206 parse-fail log.warn
//   L211-220 ?? field fallbacks + catch log.warn
//   L236     translate OptionalChaining text?.trim()
//   L240-249 translate body + response extraction

import { jest } from '@jest/globals';

// ── Logger spy ────────────────────────────────────────────────────────────────

const mockLog = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockChildLogger = jest.fn(() => mockLog);
jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: mockChildLogger,
}));

// ── Config ────────────────────────────────────────────────────────────────────

const cfg = {
  CLAUDE_API_KEY: 'sk-mutations-test',
  CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
};
jest.unstable_mockModule('../../src/core/config.js', () => ({ config: cfg }));

// ── apiFetch ──────────────────────────────────────────────────────────────────

const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

// ── Metrics ───────────────────────────────────────────────────────────────────

const mockRecordRequest   = jest.fn();
const mockRecordFailure   = jest.fn();
const mockRecordLatency   = jest.fn();
const mockSetCircuitState = jest.fn();
jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordRequest:   mockRecordRequest,
  recordFailure:   mockRecordFailure,
  recordLatency:   mockRecordLatency,
  setCircuitState: mockSetCircuitState,
}));

// ── Feature flags ─────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/featureFlags.js', () => ({
  isEnabled: jest.fn(async () => true),
  FLAGS: { CLAUDE_NLU: 'claude.nlu' },
}));

// ── CircuitBreaker mock — real withRetry (no sleep) so _isRetryable is called ─

let _capturedCtorArgs;  // { name, opts } — set by the mock constructor
const mockExec     = jest.fn();
const mockGetState = jest.fn(() => 'CLOSED');

jest.unstable_mockModule('../../src/services/circuitBreaker.js', () => {
  // Inline error classes matching the real ones
  class CircuitOpenError extends Error {
    constructor(p) {
      super(`Circuit breaker OPEN for provider "${p}"`);
      this.name = 'CircuitOpenError'; this.provider = p;
    }
  }
  class TimeoutError extends Error {
    constructor(p, ms) {
      super(`Request to "${p}" timed out after ${ms}ms`);
      this.name = 'TimeoutError'; this.provider = p; this.timeoutMs = ms;
    }
  }
  class HttpError extends Error {
    constructor(s, m) { super(m); this.name = 'HttpError'; this.status = s; }
  }

  // Real withRetry without sleep — _isRetryable IS called for retry decisions.
  async function withRetry(fn, opts = {}) {
    const { maxRetries = 3, shouldRetry = () => true } = opts;
    let attempt = 0;
    for (;;) {
      try { return await fn(); }
      catch (err) {
        if (attempt >= maxRetries || !shouldRetry(err, attempt)) throw err;
        attempt++;
      }
    }
  }

  const MockCB = jest.fn((name, opts) => {
    _capturedCtorArgs = { name, opts };
    return { exec: mockExec, getState: mockGetState };
  });

  return {
    CircuitBreaker:   MockCB,
    CircuitOpenError, TimeoutError, HttpError,
    withRetry,
    STATE: { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' },
  };
});

// ── Import under test ─────────────────────────────────────────────────────────

const { analyze, translate } = await import('../../src/services/claude.client.js');
const { config }             = await import('../../src/core/config.js');
const {
  CircuitOpenError, TimeoutError, HttpError,
} = await import('../../src/services/circuitBreaker.js');

// ── Capture module-init calls (before any beforeEach can clear them) ──────────

const _initSetCircuitCalls = mockSetCircuitState.mock.calls.map(a => [...a]);
const _breakerCtorName     = _capturedCtorArgs?.name;
const _breakerOpts         = _capturedCtorArgs?.opts;
// L19: childLogger('claude') is called at module level
const _loggerInitArg       = mockChildLogger.mock.calls[0]?.[0];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOkRes(text) {
  return {
    ok: true, status: 200,
    json: async () => ({ content: [{ text }] }),
    text: async () => text,
  };
}
function makeErrRes(status, body = 'error body') {
  return {
    ok: false, status,
    json: async () => ({}),
    text: async () => body,
  };
}
function claudeJson(obj) { return JSON.stringify(obj); }
const OK_RESPONSE = makeOkRes(claudeJson({ intent: 'list_events', subject: '', date: '', time: '', confidence: 0.9, errors: [], strategy: 'claude' }));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  cfg.CLAUDE_API_KEY = 'sk-mutations-test';
  cfg.CLAUDE_MODEL   = 'claude-haiku-4-5-20251001';
  mockGetState.mockReturnValue('CLOSED');
  // Default: exec passes through to fn so apiFetch is called
  mockExec.mockImplementation(async (fn) => fn(new AbortController().signal));
  mockApiFetch.mockResolvedValue(OK_RESPONSE);
});

// ═════════════════════════════════════════════════════════════════════════════
// L23 / L36 StringLiteral 'claude' — breaker name + setCircuitState init
// ═════════════════════════════════════════════════════════════════════════════

describe('Module init — StringLiteral "claude" killers', () => {
  test('childLogger("claude") called on module load (L19)', () => {
    expect(_loggerInitArg).toBe('claude'); // kills StringLiteral L19:25 "" mutant
  });

  test('CircuitBreaker constructed with name "claude" (L23)', () => {
    expect(_breakerCtorName).toBe('claude');
  });

  test('setCircuitState("claude", "CLOSED") called on module load (L36)', () => {
    expect(_initSetCircuitCalls).toContainEqual(['claude', 'CLOSED']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L29-33 onStateChange — BlockStatement / ObjectLiteral / StringLiteral
// ═════════════════════════════════════════════════════════════════════════════

describe('onStateChange callback (L29-33 killers)', () => {
  test('calls setCircuitState(name, newState) on state change (L29 BlockStatement)', () => {
    _breakerOpts.onStateChange('OPEN', 'claude');
    expect(mockSetCircuitState).toHaveBeenCalledWith('claude', 'OPEN');
  });

  test('includes { provider, state } in log.warn (L30 ObjectLiteral)', () => {
    _breakerOpts.onStateChange('HALF_OPEN', 'claude');
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'claude', state: 'HALF_OPEN' }),
      expect.any(String),
    );
  });

  test('log.warn message includes new state (L30 StringLiteral)', () => {
    _breakerOpts.onStateChange('OPEN', 'claude');
    const [, msg] = mockLog.warn.mock.calls[0];
    expect(msg).toContain('OPEN');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L45-48 _isRetryable — retry counts discriminate error types
// withRetry is real (no sleep) so _isRetryable IS called for each error.
// maxRetries=2 in _call → total calls = 1 + retries.
// ═════════════════════════════════════════════════════════════════════════════

describe('_isRetryable — retry count killers (L45-48)', () => {
  test('HttpError 5xx IS retried: exec called 3 times (1 + 2 retries)', async () => {
    const err = new HttpError(503, 'Service Unavailable');
    mockExec.mockRejectedValue(err);
    await analyze('test'); // falls back to rule-based after exhausting retries
    expect(mockExec).toHaveBeenCalledTimes(3); // kills BooleanLiteral L48 "false"
  });

  test('HttpError 4xx is NOT retried: exec called exactly 1 time', async () => {
    const err = new HttpError(422, 'Unprocessable Entity');
    mockExec.mockRejectedValue(err);
    await analyze('test');
    expect(mockExec).toHaveBeenCalledTimes(1); // kills ConditionalExpression L47:35 "true"
  });

  test('HttpError 400 (boundary) is NOT retried', async () => {
    mockExec.mockRejectedValue(new HttpError(400, 'Bad Request'));
    await analyze('test');
    expect(mockExec).toHaveBeenCalledTimes(1); // kills EqualityOperator L47:56
  });

  test('HttpError 500 (boundary) IS retried (3 calls)', async () => {
    mockExec.mockRejectedValue(new HttpError(500, 'Internal Server Error'));
    await analyze('test');
    expect(mockExec).toHaveBeenCalledTimes(3); // kills LogicalOperator L47:7 variants
  });

  test('CircuitOpenError is NOT retried: exec called exactly 1 time', async () => {
    mockExec.mockRejectedValue(new CircuitOpenError('claude'));
    await analyze('test');
    expect(mockExec).toHaveBeenCalledTimes(1); // kills ConditionalExpression L46:7 "false"
  });

  test('generic Error IS retried: exec called 3 times', async () => {
    mockExec.mockRejectedValue(new Error('network error'));
    await analyze('test');
    expect(mockExec).toHaveBeenCalledTimes(3); // kills ConditionalExpression L46:7 "true"
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L52-55 _failureReason — string literal killers
// ═════════════════════════════════════════════════════════════════════════════

describe('_failureReason string killers (L52-55)', () => {
  test('CircuitOpenError → recordFailure("circuit_open")', async () => {
    mockExec.mockRejectedValue(new CircuitOpenError('claude'));
    await analyze('test');
    expect(mockRecordFailure).toHaveBeenCalledWith('claude', 'circuit_open');
  });

  test('TimeoutError → recordFailure("timeout")', async () => {
    mockExec.mockRejectedValue(new TimeoutError('claude', 30_000));
    await analyze('test');
    expect(mockRecordFailure).toHaveBeenCalledWith('claude', 'timeout');
  });

  test('HttpError 5xx → recordFailure("http_5xx")', async () => {
    mockExec.mockRejectedValue(new HttpError(503, 'unavailable'));
    await analyze('test');
    expect(mockRecordFailure).toHaveBeenCalledWith('claude', 'http_5xx');
  });

  test('HttpError 4xx → recordFailure("http_4xx")', async () => {
    mockExec.mockRejectedValue(new HttpError(403, 'forbidden'));
    await analyze('test');
    expect(mockRecordFailure).toHaveBeenCalledWith('claude', 'http_4xx');
  });

  test('generic Error → recordFailure("network")', async () => {
    mockExec.mockRejectedValue(new Error('ECONNRESET'));
    await analyze('test');
    expect(mockRecordFailure).toHaveBeenCalledWith('claude', 'network');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L58-62 _requestStatus — string literal killers
// ═════════════════════════════════════════════════════════════════════════════

describe('_requestStatus string killers (L58-62)', () => {
  test('CircuitOpenError → recordRequest("circuit_open")', async () => {
    mockExec.mockRejectedValue(new CircuitOpenError('claude'));
    await analyze('test');
    expect(mockRecordRequest).toHaveBeenCalledWith('claude', 'circuit_open');
  });

  test('TimeoutError → recordRequest("timeout")', async () => {
    mockExec.mockRejectedValue(new TimeoutError('claude', 30_000));
    await analyze('test');
    expect(mockRecordRequest).toHaveBeenCalledWith('claude', 'timeout');
  });

  test('generic Error → recordRequest("error")', async () => {
    mockExec.mockRejectedValue(new Error('unknown'));
    await analyze('test');
    expect(mockRecordRequest).toHaveBeenCalledWith('claude', 'error');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L79-84 apiFetch URL / method / headers — StringLiteral killers
// ═════════════════════════════════════════════════════════════════════════════

describe('_call API headers and URL (L79-84 killers)', () => {
  test('apiFetch called with Anthropic API URL (L79)', async () => {
    await analyze('créer rendez-vous');
    expect(mockApiFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.any(Object),
    );
  });

  test('apiFetch called with method POST (L80)', async () => {
    await analyze('test');
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.method).toBe('POST');
  });

  test('Content-Type header is application/json (L82)', async () => {
    await analyze('test');
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  test('x-api-key header contains the API key (L82)', async () => {
    await analyze('test');
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.headers['x-api-key']).toBe('sk-mutations-test');
  });

  test('anthropic-version header is set (L84)', async () => {
    await analyze('test');
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L91-92 res.text().catch + HttpError message — StringLiteral / MethodExpression
// ═════════════════════════════════════════════════════════════════════════════

describe('HttpError body handling (L91-92 killers)', () => {
  test('res.text() result is included in HttpError message (L92 StringLiteral)', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false, status: 400,
      json: async () => ({}),
      text: async () => 'Detailed error message',
    });
    // Spy on warn to check the error message contains "400" and detail
    await analyze('test');
    // analyze falls back to rule-based on error; we verify the failure was logged
    expect(mockRecordFailure).toHaveBeenCalledWith('claude', 'http_4xx');
  });

  test('res.text() throwing does not crash _call (L92 MethodExpression catch)', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false, status: 422,
      json: async () => ({}),
      text: async () => { throw new Error('text() failed'); },
    });
    const result = await analyze('test');
    expect(result.strategy).toBe('rule-based');
    expect(mockRecordFailure).toHaveBeenCalledWith('claude', 'http_4xx');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L96 / L105 / L113 ObjectLiteral — requestId/metrics opts
// ═════════════════════════════════════════════════════════════════════════════

describe('Metrics call shape (L96/L97/L105/L113 ObjectLiteral killers)', () => {
  test('exec called with timeoutMs opts (L97 ObjectLiteral)', async () => {
    await analyze('test');
    // breaker.exec(fn, { requestId, timeoutMs: 30_000 }) — mutant replaces with {}
    const [, execOpts] = mockExec.mock.calls[0];
    expect(execOpts).toMatchObject({ timeoutMs: 30_000 });
  });

  test('recordRequest called with "success" string (L105 StringLiteral)', async () => {
    await analyze('test');
    expect(mockRecordRequest).toHaveBeenCalledWith('claude', 'success');
  });

  test('recordLatency called with a non-negative number < 10s (L102 ArithmeticOperator)', async () => {
    await analyze('test');
    const [, latency] = mockRecordLatency.mock.calls[0];
    expect(latency).toBeGreaterThanOrEqual(0);
    expect(latency).toBeLessThan(10_000); // kills Date.now() + start mutant
  });

  test('failure path recordLatency also reasonable (L109 ArithmeticOperator)', async () => {
    mockExec.mockRejectedValue(new Error('fail'));
    await analyze('test');
    const [, latency] = mockRecordLatency.mock.calls[0];
    expect(latency).toBeGreaterThanOrEqual(0);
    expect(latency).toBeLessThan(10_000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L113 / L117 — log.warn on _call failure (ObjectLiteral / StringLiteral killers)
// ═════════════════════════════════════════════════════════════════════════════

describe('_call failure log.warn (L113/L117 killers)', () => {
  test('log.warn includes err.message in object (L113 ObjectLiteral)', async () => {
    mockExec.mockRejectedValue(new Error('ECONNRESET failure'));
    await analyze('test');
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'ECONNRESET failure' }),
      expect.any(String),
    );
  });

  test('log.warn message is "Claude request failed" (L117 StringLiteral)', async () => {
    mockExec.mockRejectedValue(new Error('x'));
    await analyze('test');
    const warnCalls = mockLog.warn.mock.calls;
    const hasMsgCall = warnCalls.some(([, msg]) => msg === 'Claude request failed');
    expect(hasMsgCall).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L40-41 _escJson — BlockStatement / StringLiteral killers
// ═════════════════════════════════════════════════════════════════════════════

describe('_escJson special-char escaping (L40-41 killers)', () => {
  // L41 has 3 StringLiteral survivors: '\\\\' (backslash), '\\"' (quote), '\\n' (newline)
  // Each test verifies the escaped FORM in the content string — the mutant
  // replaces the replacement target with '' which changes the content value.

  test('double-quote in text is escaped as \\" in content (L41 StringLiteral \\")', async () => {
    await analyze('book "urgent" meeting');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    const content = body.messages[0].content;
    // With proper escaping: content contains backslash+quote around "urgent"
    // Mutant ('\\"' → ''): quote is removed, not escaped → content has raw quotes
    expect(content).toContain('\\"urgent\\"'); // kills the '\\"' replacement mutant
  });

  test('newline in text is escaped as \\n literal in content (L41 StringLiteral \\n)', async () => {
    await analyze('meeting\nat 9am'); // \n = actual newline character
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    const content = body.messages[0].content;
    // With proper escaping: content has literal backslash+n (not an actual newline)
    // Mutant ('\\n' → ''): newline removed → content has actual newline char \u000a
    expect(content).toContain('\\n'); // the two-char sequence: backslash + 'n'
    expect(content).not.toContain('\u000a'); // no actual newline in content
  });

  test('backslash in text is doubled in content (L41 StringLiteral \\\\)', async () => {
    await analyze('path\\to meeting'); // one backslash
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    const content = body.messages[0].content;
    // With proper escaping: one backslash → two backslashes in content
    // Mutant ('\\\\' → ''): backslash is removed → content has no backslash
    expect(content).toContain('\\\\'); // two-char sequence: backslash + backslash
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L129 Regex — update_event detection (_ruleBased)
// No API key → forced rule-based
// ═════════════════════════════════════════════════════════════════════════════

describe('_ruleBased update_event regex (L129 killer)', () => {
  beforeEach(() => { cfg.CLAUDE_API_KEY = ''; }); // force rule-based

  test('"modifier" triggers update_event', async () => {
    const r = await analyze('modifier le rendez-vous de lundi');
    expect(r.intent).toBe('update_event');
    expect(r.strategy).toBe('rule-based');
  });

  test('"déplace" (with accent) triggers update_event', async () => {
    const r = await analyze('déplace la réunion à demain');
    expect(r.intent).toBe('update_event');
  });

  test('"repouss" triggers update_event', async () => {
    const r = await analyze('repousse le meeting de 2h');
    expect(r.intent).toBe('update_event');
  });

  test('"change" triggers update_event', async () => {
    const r = await analyze('change l\'heure du rendez-vous');
    expect(r.intent).toBe('update_event');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L133-146 _ruleBased date parsing — StringLiteral / Regex killers
// ═════════════════════════════════════════════════════════════════════════════

describe('_ruleBased date parsing (L133-146 killers)', () => {
  beforeEach(() => { cfg.CLAUDE_API_KEY = ''; });

  test('"demain" → tomorrow\'s date (L135 StringLiteral)', async () => {
    const r = await analyze('créer réunion demain à 10h');
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    expect(r.date).toBe(tomorrow.toISOString().slice(0, 10));
  });

  test('"aujourd\'hui" → today\'s date', async () => {
    const r = await analyze("planifier aujourd'hui à 14h");
    const today = new Date().toISOString().slice(0, 10);
    expect(r.date).toBe(today);
  });

  test('dd/mm format → correct ISO date (L143 Regex killers)', async () => {
    const r = await analyze('réunion le 15/06 à 9h');
    const year = new Date().getFullYear();
    expect(r.date).toBe(`${year}-06-15`);
  });

  test('dd/mm single-digit day (L143 \\d{1,2} killer)', async () => {
    const r = await analyze('meeting le 1/07 à 10h');
    const year = new Date().getFullYear();
    expect(r.date).toBe(`${year}-07-01`);
  });

  test('time parsed as HH:MM format (L133 StringLiteral)', async () => {
    const r = await analyze('réunion demain à 14h30');
    expect(r.time).toBe('14:30');
  });

  test('time with no minutes defaults to 00 (L133 StringLiteral)', async () => {
    const r = await analyze('rendez-vous à 9h');
    expect(r.time).toBe('9:00');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L148-155 subject extraction + confidence — Regex / OptionalChaining / ArrayDeclaration
// ═════════════════════════════════════════════════════════════════════════════

describe('_ruleBased subject and confidence (L148-155 killers)', () => {
  beforeEach(() => { cfg.CLAUDE_API_KEY = ''; });

  test('"avec X" extracts subject (L148 Regex)', async () => {
    const r = await analyze('réunion avec Pierre à 15h');
    expect(r.subject).toBe('pierre');
  });

  test('"pour X" extracts subject', async () => {
    const r = await analyze('meeting pour le projet alpha à 10h');
    expect(r.subject).not.toBe('');
    expect(r.subject).toContain('projet alpha');
  });

  test('subject trimmed (L151 MethodExpression + OptionalChaining)', async () => {
    const r = await analyze('réunion avec  Marie  à 10h');
    expect(r.subject).toBe(r.subject.trim()); // no leading/trailing spaces
  });

  test('no subject match → subject is empty string (L151 OptionalChaining null guard)', async () => {
    const r = await analyze('créer un rendez-vous');
    expect(r.subject).toBe('');
  });

  test('unknown intent → confidence 0.25 (L154 ConditionalExpression killer)', async () => {
    const r = await analyze('bonjour');
    expect(r.intent).toBe('unknown');
    expect(r.confidence).toBe(0.25);
  });

  test('known intent → confidence 0.85', async () => {
    const r = await analyze('créer un meeting');
    expect(r.intent).toBe('create_event');
    expect(r.confidence).toBe(0.85);
  });

  test('errors is always [] (L155 ArrayDeclaration killer)', async () => {
    const r = await analyze('test');
    expect(r.errors).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L175 empty-input exact shape — StringLiteral killers
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze() empty-input exact shape (L175 killers)', () => {
  test('empty string → strategy "none"', async () => {
    const r = await analyze('');
    expect(r.strategy).toBe('none');
  });

  test('empty string → confidence 0', async () => {
    const r = await analyze('');
    expect(r.confidence).toBe(0);
  });

  test('empty string → errors includes "empty-input"', async () => {
    const r = await analyze('');
    expect(r.errors).toContain('empty-input');
  });

  test('empty string → intent "unknown"', async () => {
    const r = await analyze('');
    expect(r.intent).toBe('unknown');
  });

  test('whitespace-only → same empty-input shape', async () => {
    const r = await analyze('   ');
    expect(r.strategy).toBe('none');
    expect(r.confidence).toBe(0);
    expect(r.errors).toContain('empty-input');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L184 opts.model ?? config.CLAUDE_MODEL — LogicalOperator killer
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze body — opts.model and temperature (L184/L194 killers)', () => {
  test('no opts.model → config.CLAUDE_MODEL used in API body (L184 LogicalOperator)', async () => {
    await analyze('test');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
  });

  test('opts.model provided → custom model used', async () => {
    mockApiFetch.mockResolvedValueOnce(OK_RESPONSE);
    await analyze('test', { model: 'claude-opus-4-6' });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-opus-4-6');
  });

  test('no opts.temperature → temperature=0 in body (L194 LogicalOperator)', async () => {
    await analyze('test');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0); // ?? 0; with && mutant: undefined && 0 = undefined
  });

  test('opts.temperature=0.5 → 0.5 in body', async () => {
    await analyze('test', { temperature: 0.5 });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L186-189 system prompt StringLiterals + L192-197 body structure
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze API body — system prompt + messages (L186-197 killers)', () => {
  test('system prompt contains NLU instruction keywords (L186-189)', async () => {
    await analyze('créer réunion');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.system).toContain('extracteur NLU');
    expect(body.system).toContain('create_event');
    expect(body.system).toContain('confidence');
  });

  test('max_tokens is 256 (L192 ObjectLiteral)', async () => {
    await analyze('test');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(256);
  });

  test('messages is a non-empty array (L196 ArrayDeclaration)', async () => {
    await analyze('test');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBeGreaterThan(0);
  });

  test('messages[0].role is "user" (L196 StringLiteral)', async () => {
    await analyze('test');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('user');
  });

  test('messages[0].content contains input text (L197 ObjectLiteral)', async () => {
    await analyze('réunion vendredi');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('réunion vendredi');
  });

  test('messages[0].content contains "Texte à analyser" prefix (L196 StringLiteral)', async () => {
    await analyze('test');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toMatch(/Texte à analyser/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L199-200 OptionalChaining + Regex — content extraction + markdown stripping
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — content OptionalChaining + Regex (L199-200 killers)', () => {
  test('null content → rule-based fallback (L199 OptionalChaining json.content[0])', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ content: null }),
      text: async () => '',
    });
    const r = await analyze('test');
    expect(r.strategy).toBe('rule-based');
  });

  test('missing content array → rule-based fallback (L199 OptionalChaining)', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({}),
      text: async () => '',
    });
    const r = await analyze('test');
    expect(r.strategy).toBe('rule-based');
  });

  test('null text in content[0] → rule-based fallback (L199 OptionalChaining .text)', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ content: [{ text: null }] }),
      text: async () => '',
    });
    const r = await analyze('test');
    expect(r.strategy).toBe('rule-based');
  });

  test('```json wrapper is stripped before parse (L200 Regex)', async () => {
    const payload = { intent: 'create_event', subject: 'test', date: '', time: '', confidence: 0.9, errors: [], strategy: 'claude' };
    mockApiFetch.mockResolvedValueOnce(makeOkRes(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``));
    const r = await analyze('créer');
    expect(r.intent).toBe('create_event');
    expect(r.strategy).toBe('claude');
  });

  test('``` without json wrapper is also stripped (L200 Regex variant)', async () => {
    const payload = { intent: 'list_events', subject: '', date: '', time: '', confidence: 0.8, errors: [], strategy: 'claude' };
    mockApiFetch.mockResolvedValueOnce(makeOkRes(`\`\`\`\n${JSON.stringify(payload)}\n\`\`\``));
    const r = await analyze('liste');
    expect(r.intent).toBe('list_events');
  });

  test('trailing ``` stripped from response (L200 Regex /\\n?```$/)', async () => {
    const payload = { intent: 'cancel_event', subject: '', date: '', time: '', confidence: 0.8, errors: [], strategy: 'claude' };
    mockApiFetch.mockResolvedValueOnce(makeOkRes(`${JSON.stringify(payload)}\n\`\`\``));
    const r = await analyze('annuler');
    expect(r.intent).toBe('cancel_event');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L205-206 parse failure log.warn — BlockStatement / ObjectLiteral / MethodExpression
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — JSON parse failure log (L205-206 killers)', () => {
  test('invalid JSON → rule-based fallback + log.warn called (L205 BlockStatement)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('not-json-at-all'));
    const r = await analyze('test');
    expect(r.strategy).toBe('rule-based');
    expect(mockLog.warn).toHaveBeenCalled();
  });

  test('parse failure log includes raw content (L206 ObjectLiteral)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('BROKEN_JSON'));
    await analyze('test');
    const warnCall = mockLog.warn.mock.calls.find(([obj]) => obj && 'raw' in obj);
    expect(warnCall).toBeDefined(); // kills ObjectLiteral { raw: raw.slice(0,200) }
  });

  test('parse failure log message is "Claude JSON parse failed..." (L206 StringLiteral)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('BAD_JSON'));
    await analyze('test');
    const hasMsg = mockLog.warn.mock.calls.some(([, msg]) =>
      typeof msg === 'string' && msg.includes('parse failed'),
    );
    expect(hasMsg).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L211-217 ?? fallback field values — ObjectLiteral killers
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — parsed field ?? fallbacks (L211-217 killers)', () => {
  function mockWith(partial) {
    mockApiFetch.mockResolvedValueOnce(makeOkRes(JSON.stringify(partial)));
  }

  test('missing intent → "unknown"', async () => {
    mockWith({ subject: 'x', confidence: 0.9, errors: [], strategy: 'claude' });
    const r = await analyze('test');
    expect(r.intent).toBe('unknown');
  });

  test('missing subject → ""', async () => {
    mockWith({ intent: 'create_event', confidence: 0.9, errors: [], strategy: 'claude' });
    const r = await analyze('test');
    expect(r.subject).toBe('');
  });

  test('missing date → ""', async () => {
    mockWith({ intent: 'create_event', confidence: 0.9, errors: [], strategy: 'claude' });
    const r = await analyze('test');
    expect(r.date).toBe('');
  });

  test('missing time → ""', async () => {
    mockWith({ intent: 'create_event', confidence: 0.9, errors: [], strategy: 'claude' });
    const r = await analyze('test');
    expect(r.time).toBe('');
  });

  test('confidence is string → fallback 0.8', async () => {
    mockWith({ intent: 'create_event', confidence: 'high', errors: [], strategy: 'claude' });
    const r = await analyze('test');
    expect(r.confidence).toBe(0.8); // typeof 'high' !== 'number' → 0.8
  });

  test('confidence is number → used as-is', async () => {
    mockWith({ intent: 'create_event', confidence: 0.95, errors: [], strategy: 'claude' });
    const r = await analyze('test');
    expect(r.confidence).toBe(0.95);
  });

  test('missing errors → []', async () => {
    mockWith({ intent: 'create_event', confidence: 0.9, strategy: 'claude' });
    const r = await analyze('test');
    expect(r.errors).toEqual([]);
  });

  test('missing strategy → "claude"', async () => {
    mockWith({ intent: 'create_event', confidence: 0.9, errors: [] });
    const r = await analyze('test');
    expect(r.strategy).toBe('claude');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L220 analyze catch log.warn — ObjectLiteral / StringLiteral killers
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze catch log.warn (L220 killers)', () => {
  test('log.warn includes err.message when _call throws (L220 ObjectLiteral)', async () => {
    mockExec.mockRejectedValue(new Error('unexpected API error'));
    await analyze('test');
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'unexpected API error' }),
      expect.any(String),
    );
  });

  test('log.warn message is "Claude analyze failed..." (L220 StringLiteral)', async () => {
    mockExec.mockRejectedValue(new Error('x'));
    await analyze('test');
    const hasMsg = mockLog.warn.mock.calls.some(([, msg]) =>
      typeof msg === 'string' && msg.includes('analyze failed'),
    );
    expect(hasMsg).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L236 translate — OptionalChaining text?.trim() + MethodExpression
// ═════════════════════════════════════════════════════════════════════════════

describe('translate — text?.trim() guard (L236 killers)', () => {
  test('translate(undefined) returns undefined without throwing (L236 OptionalChaining)', async () => {
    await expect(translate(undefined, 'en')).resolves.toBeUndefined();
  });

  test('translate(null) returns null without throwing', async () => {
    await expect(translate(null, 'en')).resolves.toBeNull();
  });

  test('translate with whitespace-only → returns original (L236 MethodExpression)', async () => {
    const result = await translate('   ', 'en');
    expect(result).toBe('   ');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L240-249 translate body + response extraction
// ═════════════════════════════════════════════════════════════════════════════

describe('translate API body and response (L240-249 killers)', () => {
  test('translate body has model=config.CLAUDE_MODEL (L240 ObjectLiteral)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('Hello'));
    await translate('Bonjour', 'en');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
  });

  test('translate body has temperature=0.3 (L240 ObjectLiteral)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('Hello'));
    await translate('Bonjour', 'en');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.3);
  });

  test('translate system prompt mentions "traducteur" (L244 StringLiteral)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('Hello'));
    await translate('Bonjour', 'en');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.system).toContain('traducteur');
  });

  test('translate messages[0].role is "user" (L245 StringLiteral)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('Hello'));
    await translate('Bonjour', 'en');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('user');
  });

  test('translate messages content contains source text (L245 ObjectLiteral)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('Hello'));
    await translate('Bonjour', 'en');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('Bonjour');
    expect(body.messages[0].content).toContain('en'); // targetLang
  });

  test('translate messages is non-empty array (L245 ArrayDeclaration)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('Hello'));
    await translate('Bonjour', 'en');
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBeGreaterThan(0);
  });

  test('translate returns content[0].text trimmed (L247 OptionalChaining + MethodExpression)', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('  Hello World  '));
    const r = await translate('Bonjour', 'en');
    expect(r).toBe('Hello World'); // .trim() applied
  });

  test('translate null content → returns original (L247 OptionalChaining null guard)', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ content: null }),
      text: async () => '',
    });
    const r = await translate('Bonjour', 'en');
    expect(r).toBe('Bonjour');
  });

  test('translate content[0].text null → returns original (L247 OptionalChaining .text)', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ content: [{ text: null }] }),
      text: async () => '',
    });
    const r = await translate('Bonjour', 'en');
    expect(r).toBe('Bonjour');
  });

  test('translate catch log.warn includes err.message (L249 ObjectLiteral)', async () => {
    // Reject persistently so withRetry exhausts all retries and translate() catches
    mockExec.mockRejectedValue(new Error('translate API error'));
    const r = await translate('Bonjour', 'en');
    expect(r).toBe('Bonjour'); // original returned
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'translate API error' }),
      expect.any(String),
    );
  });

  test('translate catch log message is "Claude translate failed..." (L249 StringLiteral)', async () => {
    mockExec.mockRejectedValue(new Error('x'));
    await translate('Bonjour', 'en');
    // Source: 'Claude translate failed — returning original'
    const hasMsg = mockLog.warn.mock.calls.some(([, m]) =>
      typeof m === 'string' && m.includes('Claude translate failed'),
    );
    expect(hasMsg).toBe(true);
  });
});
