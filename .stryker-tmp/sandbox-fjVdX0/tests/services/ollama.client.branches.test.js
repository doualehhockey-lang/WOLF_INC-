// @ts-nocheck
// tests/services/ollama.client.branches.test.js
// Covers ollama.client.js:
//   Line 100: timeoutMs = config.OLLAMA_TIMEOUT ?? 120_000 (undefined OLLAMA_TIMEOUT)
//   Line 197: parsed.intent ?? 'unknown' and other nullish defaults in analyze()

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// OLLAMA_TIMEOUT intentionally absent → exercises the ?? 120_000 branch on line 100
jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    OLLAMA_URL:   'http://localhost:11434',
    OLLAMA_MODEL: 'llama3.2:3b',
    // no OLLAMA_TIMEOUT
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

const { _makeOllamaClient } = await import('../../src/services/ollama.client.js');
const { CircuitBreaker }    = await import('../../src/services/circuitBreaker.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient() {
  const breaker = new CircuitBreaker(`ollama-branches-${Math.random()}`, { failureThreshold: 100 });
  return _makeOllamaClient(breaker, { maxRetries: 0, baseMs: 0, maxMs: 0 });
}

function okChatResponse(content) {
  return {
    ok:     true,
    status: 200,
    json:   async () => ({ message: { role: 'assistant', content }, done: true }),
    text:   async () => JSON.stringify({ message: { content }, done: true }),
  };
}

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 100: config.OLLAMA_TIMEOUT ?? 120_000
// ═════════════════════════════════════════════════════════════════════════════

describe('chat() — OLLAMA_TIMEOUT fallback (line 100)', () => {
  test('succeeds when config.OLLAMA_TIMEOUT is undefined — uses 120_000 default', async () => {
    // cfg has no OLLAMA_TIMEOUT, so ?? 120_000 branch is taken
    mockApiFetch.mockResolvedValueOnce(okChatResponse('Bonjour!'));
    const { chat } = makeClient();
    const result   = await chat([{ role: 'user', content: 'Salut' }]);
    expect(result).toBe('Bonjour!');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 197+: nullish defaults in parsed analyze() response
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze() — nullish ?? defaults in parsed response (lines 197-202)', () => {
  test('falls back to "unknown" when parsed.intent is missing', async () => {
    const content = JSON.stringify({ subject: 'réunion', confidence: 0.8, errors: [], strategy: 'ollama' });
    mockApiFetch.mockResolvedValueOnce(okChatResponse(content));
    const { analyze } = makeClient();
    const result      = await analyze('réunion demain');
    expect(result.intent).toBe('unknown');
  });

  test('falls back to empty string when parsed.subject is missing', async () => {
    const content = JSON.stringify({ intent: 'list_events', confidence: 0.8, errors: [] });
    mockApiFetch.mockResolvedValueOnce(okChatResponse(content));
    const { analyze } = makeClient();
    const result      = await analyze('quels sont mes rendez-vous');
    expect(result.subject).toBe('');
  });

  test('falls back to empty string when parsed.date is missing', async () => {
    const content = JSON.stringify({ intent: 'list_events', subject: 'réunion' });
    mockApiFetch.mockResolvedValueOnce(okChatResponse(content));
    const { analyze } = makeClient();
    const result      = await analyze('réunion');
    expect(result.date).toBe('');
  });

  test('falls back to empty string when parsed.time is missing', async () => {
    const content = JSON.stringify({ intent: 'create_event', subject: 'déjeuner', date: 'demain' });
    mockApiFetch.mockResolvedValueOnce(okChatResponse(content));
    const { analyze } = makeClient();
    const result      = await analyze('déjeuner demain');
    expect(result.time).toBe('');
  });

  test('falls back to 0.7 when parsed.confidence is not a number', async () => {
    const content = JSON.stringify({ intent: 'create_event', subject: 'réunion', confidence: 'high' });
    mockApiFetch.mockResolvedValueOnce(okChatResponse(content));
    const { analyze } = makeClient();
    const result      = await analyze('réunion demain');
    expect(result.confidence).toBe(0.7);
  });

  test('falls back to empty array when parsed.errors is missing', async () => {
    const content = JSON.stringify({ intent: 'create_event', subject: 'réunion', confidence: 0.9 });
    mockApiFetch.mockResolvedValueOnce(okChatResponse(content));
    const { analyze } = makeClient();
    const result      = await analyze('réunion demain');
    expect(result.errors).toEqual([]);
  });

  test('returns strategy "ollama" regardless of parsed fields', async () => {
    const content = JSON.stringify({ intent: 'cancel_event' });
    mockApiFetch.mockResolvedValueOnce(okChatResponse(content));
    const { analyze } = makeClient();
    const result      = await analyze('annule mon rendez-vous');
    expect(result.strategy).toBe('ollama');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 120: res.text().catch(() => '') when text() throws on non-ok response
// ═════════════════════════════════════════════════════════════════════════════

describe('chat() — res.text().catch fallback (line 120)', () => {
  test('catch(() => "") fires when res.text() rejects on non-ok response', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok:     false,
      status: 503,
      text:   jest.fn().mockRejectedValueOnce(new Error('body unreadable')),
    });
    const { chat } = makeClient();
    await expect(chat([{ role: 'user', content: 'test' }])).rejects.toThrow('Ollama 503');
    // catch(() => '') was invoked — detail is '' → message still includes status
  });
});
