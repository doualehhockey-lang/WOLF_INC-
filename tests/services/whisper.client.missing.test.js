// tests/services/whisper.client.missing.test.js
// Covers whisper.client.js:
//   Line 68: json field fallback chain (transcription → result → transcript)
//   Line 78: missing OPENAI_API_KEY throws
//   Line 104: OpenAI empty response throws

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// Mutable config object — tests mutate fields to exercise different branches
const cfg = {
<<<<<<< HEAD
  WHISPER_BACKEND: 'local-server',
  WHISPER_SERVER_URL: 'http://localhost:9000/transcribe',
  WHISPER_TIMEOUT: 5_000,
  OPENAI_API_KEY: 'sk-test',
=======
  WHISPER_BACKEND:    'local-server',
  WHISPER_SERVER_URL: 'http://localhost:9000/transcribe',
  WHISPER_TIMEOUT:    5_000,
  OPENAI_API_KEY:     'sk-test',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
};
jest.unstable_mockModule('../../src/core/config.js', () => ({ config: cfg }));

const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

jest.unstable_mockModule('../../src/services/metrics.js', () => ({
<<<<<<< HEAD
  recordRequest: jest.fn(),
  recordFailure: jest.fn(),
  recordLatency: jest.fn(),
  setCircuitState: jest.fn(),
  auditLogFailures: { inc: jest.fn() },
=======
  recordRequest:   jest.fn(),
  recordFailure:   jest.fn(),
  recordLatency:   jest.fn(),
  setCircuitState: jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const { _makeTranscribeWav } = await import('../../src/services/whisper.client.js');
<<<<<<< HEAD
const { CircuitBreaker } = await import('../../src/services/circuitBreaker.js');
=======
const { CircuitBreaker }     = await import('../../src/services/circuitBreaker.js');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

// ── Helpers ───────────────────────────────────────────────────────────────────

const validWav = Buffer.alloc(100, 0);

function makeClient() {
  // High threshold — circuit never opens during these unit tests
  const breaker = new CircuitBreaker(`whisper-missing-${Math.random()}`, { failureThreshold: 100 });
  return _makeTranscribeWav(breaker, { maxRetries: 0, baseMs: 0, maxMs: 0 });
}

function okResponse(body) {
  return {
<<<<<<< HEAD
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
=======
    ok:     true,
    status: 200,
    json:   async () => body,
    text:   async () => JSON.stringify(body),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset to safe defaults before each test
  cfg.WHISPER_BACKEND = 'local-server';
<<<<<<< HEAD
  cfg.OPENAI_API_KEY = 'sk-test';
=======
  cfg.OPENAI_API_KEY  = 'sk-test';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 68: json field fallback chain
// ═════════════════════════════════════════════════════════════════════════════

describe('_localServer — json field fallback chain (line 68)', () => {
  test('uses json.transcription when json.text is undefined', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse({ transcription: 'bonjour monde' }));
    const transcribeWav = makeClient();
    const out = await transcribeWav(validWav);
    expect(out).toBe('bonjour monde');
  });

  test('uses json.result when json.text and json.transcription are undefined', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse({ result: 'bonsoir' }));
    const transcribeWav = makeClient();
    const out = await transcribeWav(validWav);
    expect(out).toBe('bonsoir');
  });

  test('uses json.transcript when text/transcription/result are all undefined', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse({ transcript: 'au revoir' }));
    const transcribeWav = makeClient();
    const out = await transcribeWav(validWav);
    expect(out).toBe('au revoir');
  });

  test('throws empty-response error when all json fields are undefined', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse({ other: 'field' }));
    const transcribeWav = makeClient();
    await expect(transcribeWav(validWav)).rejects.toThrow('Whisper local server: empty response');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 78: missing OPENAI_API_KEY
// ═════════════════════════════════════════════════════════════════════════════

describe('_openai — missing API key (line 78)', () => {
  test('throws when OPENAI_API_KEY is undefined', async () => {
    cfg.WHISPER_BACKEND = 'openai';
<<<<<<< HEAD
    cfg.OPENAI_API_KEY = undefined;
=======
    cfg.OPENAI_API_KEY  = undefined;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const transcribeWav = makeClient();
    await expect(transcribeWav(validWav)).rejects.toThrow('OPENAI_API_KEY not configured');
  });

  test('throws when OPENAI_API_KEY is empty string', async () => {
    cfg.WHISPER_BACKEND = 'openai';
<<<<<<< HEAD
    cfg.OPENAI_API_KEY = '';
=======
    cfg.OPENAI_API_KEY  = '';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const transcribeWav = makeClient();
    await expect(transcribeWav(validWav)).rejects.toThrow('OPENAI_API_KEY not configured');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 64: _localServer — res.text().catch(() => '') when text() throws
// ═════════════════════════════════════════════════════════════════════════════

describe('_localServer — res.text().catch fallback (line 64)', () => {
  test('catch(() => "") fires when res.text() rejects on non-ok response', async () => {
    cfg.WHISPER_BACKEND = 'local-server';
    mockApiFetch.mockResolvedValueOnce({
<<<<<<< HEAD
      ok: false,
      status: 503,
      text: jest.fn().mockRejectedValueOnce(new Error('body unreadable')),
=======
      ok:     false,
      status: 503,
      text:   jest.fn().mockRejectedValueOnce(new Error('body unreadable')),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });
    const transcribeWav = makeClient();
    await expect(transcribeWav(validWav)).rejects.toThrow('Whisper local 503');
    // catch(() => '') was invoked — detail is '' → message still includes status
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 104: OpenAI empty response
// ═════════════════════════════════════════════════════════════════════════════

describe('_openai — empty response (line 104)', () => {
  beforeEach(() => {
    cfg.WHISPER_BACKEND = 'openai';
<<<<<<< HEAD
    cfg.OPENAI_API_KEY = 'sk-test';
=======
    cfg.OPENAI_API_KEY  = 'sk-test';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('throws when json.text is empty string', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse({ text: '' }));
    const transcribeWav = makeClient();
    await expect(transcribeWav(validWav)).rejects.toThrow('OpenAI Whisper: empty response');
  });

  test('throws when json.text is whitespace-only', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse({ text: '   ' }));
    const transcribeWav = makeClient();
    await expect(transcribeWav(validWav)).rejects.toThrow('OpenAI Whisper: empty response');
  });

  test('throws when json.text is missing entirely', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse({ other: 'field' }));
    const transcribeWav = makeClient();
    await expect(transcribeWav(validWav)).rejects.toThrow('OpenAI Whisper: empty response');
  });
});
