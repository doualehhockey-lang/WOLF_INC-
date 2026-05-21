// @ts-nocheck
// tests/services/claude.client.test.js
// Claude client: empty-input guard, no-API-key rule-based fallback,
// circuit-open fallback, successful analyze, JSON parse fail, translate paths,
// _ruleBased keyword detection, date/time parsing.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    CLAUDE_API_KEY: 'sk-test',
    CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
  },
}));

// ── Mock apiFetch ─────────────────────────────────────────────────────────────
const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

// ── Mock metrics helpers ──────────────────────────────────────────────────────
jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordRequest:   jest.fn(),
  recordFailure:   jest.fn(),
  recordLatency:   jest.fn(),
  setCircuitState: jest.fn(),
}));

// ── Mock circuit breaker ──────────────────────────────────────────────────────
let _circuitState = 'CLOSED';
const mockBreaker = {
  exec:     jest.fn(),
  getState: jest.fn(() => _circuitState),
};
jest.unstable_mockModule('../../src/services/circuitBreaker.js', () => ({
  CircuitBreaker:   jest.fn(() => mockBreaker),
  CircuitOpenError: class CircuitOpenError extends Error { constructor() { super('open'); } },
  TimeoutError:     class TimeoutError     extends Error { constructor() { super('timeout'); } },
  HttpError:        class HttpError        extends Error { constructor(s, m) { super(m); this.status = s; } },
  withRetry:        jest.fn(async (fn) => fn()),
  STATE:            { CLOSED: 'CLOSED', HALF_OPEN: 'HALF_OPEN', OPEN: 'OPEN' },
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { analyze, translate } = await import('../../src/services/claude.client.js');
const { config }             = await import('../../src/core/config.js');
const { STATE }              = await import('../../src/services/circuitBreaker.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeClaudeOkRes(text) {
  return {
    ok:      true,
    status:  200,
    json:    async () => ({ content: [{ text }] }),
    text:    async () => text,
  };
}

function claudeJson(obj) {
  return JSON.stringify(obj);
}

beforeEach(() => {
  jest.clearAllMocks();
  _circuitState = 'CLOSED';
  config.CLAUDE_API_KEY = 'sk-test';
  config.CLAUDE_MODEL   = 'claude-haiku-4-5-20251001';
  mockBreaker.getState.mockReturnValue('CLOSED');
  // Default: exec delegates to fn
  mockBreaker.exec.mockImplementation(async (fn) => fn(new AbortController().signal));
  mockApiFetch.mockResolvedValue(makeClaudeOkRes(
    claudeJson({ intent: 'list_events', subject: '', date: '', time: '', confidence: 0.9, errors: [], strategy: 'claude' })
  ));
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. analyze — input guard
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — empty/null input', () => {
  test('returns intent:unknown for empty string', async () => {
    const result = await analyze('');
    expect(result.intent).toBe('unknown');
    expect(result.errors).toContain('empty-input');
  });

  test('returns intent:unknown for whitespace', async () => {
    const result = await analyze('   ');
    expect(result.intent).toBe('unknown');
  });

  test('returns intent:unknown for null', async () => {
    const result = await analyze(null);
    expect(result.intent).toBe('unknown');
  });

  test('does NOT call apiFetch for empty input', async () => {
    await analyze('');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. analyze — rule-based fallback when no API key
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — no API key → rule-based', () => {
  beforeEach(() => { config.CLAUDE_API_KEY = ''; });

  test('returns a result without calling apiFetch', async () => {
    await analyze('Créer un rendez-vous');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('strategy is "rule-based"', async () => {
    const result = await analyze('Bonjour');
    expect(result.strategy).toBe('rule-based');
  });

  test('detects create_event from "créer"', async () => {
    const result = await analyze('Je veux créer un rendez-vous');
    expect(result.intent).toBe('create_event');
  });

  test('detects cancel_event from "annuler"', async () => {
    const result = await analyze('Annule mon rendez-vous');
    expect(result.intent).toBe('cancel_event');
  });

  test('detects update_event from "modifier"', async () => {
    const result = await analyze('Modifier mon rendez-vous de lundi');
    expect(result.intent).toBe('update_event');
  });

  test('detects list_events from "liste"', async () => {
    const result = await analyze('Liste mes rendez-vous');
    expect(result.intent).toBe('list_events');
  });

  test('returns unknown with confidence 0.25 for unrecognized text', async () => {
    const result = await analyze('Pizza margherita');
    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0.25);
  });

  test('extracts time "14h30"', async () => {
    const result = await analyze('rendez-vous à 14h30');
    expect(result.time).toBe('14:30');
  });

  test('extracts time "9:00"', async () => {
    const result = await analyze('réunion à 9:00');
    expect(result.time).toBe('9:00');
  });

  test('extracts "demain" as tomorrow date', async () => {
    const result = await analyze('rendez-vous demain');
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    expect(result.date).toBe(tomorrow.toISOString().slice(0, 10));
    expect(result.intent).toBeDefined();
  });

  test('extracts DD/MM date', async () => {
    const result = await analyze('rendez-vous le 15/06');
    expect(result.date).toMatch(/^\d{4}-06-15$/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. analyze — circuit OPEN → rule-based
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — circuit OPEN → rule-based', () => {
  test('returns rule-based when circuit is OPEN', async () => {
    mockBreaker.getState.mockReturnValue(STATE.OPEN);
    const result = await analyze('Créer un RDV');
    expect(result.strategy).toBe('rule-based');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. analyze — Claude success
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — Claude API success', () => {
  test('returns parsed intent from Claude response', async () => {
    mockApiFetch.mockResolvedValueOnce(makeClaudeOkRes(
      claudeJson({ intent: 'create_event', subject: 'Dentiste', date: '2026-06-01', time: '09:00', confidence: 0.95, errors: [], strategy: 'claude' })
    ));
    const result = await analyze('Créer rendez-vous dentiste le 01/06');
    expect(result.intent).toBe('create_event');
    expect(result.subject).toBe('Dentiste');
    expect(result.confidence).toBe(0.95);
  });

  test('defaults confidence to 0.8 when missing from response', async () => {
    mockApiFetch.mockResolvedValueOnce(makeClaudeOkRes(
      claudeJson({ intent: 'list_events' })
    ));
    const result = await analyze('Mes rendez-vous');
    expect(result.confidence).toBe(0.8);
  });

  test('handles markdown code fence in response', async () => {
    mockApiFetch.mockResolvedValueOnce(makeClaudeOkRes(
      '```json\n' + claudeJson({ intent: 'list_events', confidence: 0.9, errors: [], strategy: 'claude' }) + '\n```'
    ));
    const result = await analyze('Mes rendez-vous');
    expect(result.intent).toBe('list_events');
  });

  test('returns errors array from response', async () => {
    mockApiFetch.mockResolvedValueOnce(makeClaudeOkRes(
      claudeJson({ intent: 'unknown', errors: ['missing-date'], confidence: 0.5, strategy: 'claude' })
    ));
    const result = await analyze('Créer RDV');
    expect(result.errors).toContain('missing-date');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. analyze — JSON parse failure → rule-based fallback
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — JSON parse failure', () => {
  test('falls back to rule-based when Claude returns invalid JSON', async () => {
    mockApiFetch.mockResolvedValueOnce(makeClaudeOkRes('this is not json at all'));
    const result = await analyze('Créer RDV');
    expect(result.strategy).toBe('rule-based');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. analyze — API call throws → rule-based fallback
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — API throws', () => {
  test('falls back to rule-based when apiFetch throws', async () => {
    mockBreaker.exec.mockRejectedValueOnce(new Error('ECONNRESET'));
    const result = await analyze('Annuler mon RDV');
    expect(result.strategy).toBe('rule-based');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. translate
// ═════════════════════════════════════════════════════════════════════════════

describe('translate', () => {
  test('returns original text for empty input', async () => {
    const result = await translate('', 'en');
    expect(result).toBe('');
  });

  test('returns original text when no API key', async () => {
    config.CLAUDE_API_KEY = '';
    const result = await translate('Bonjour', 'en');
    expect(result).toBe('Bonjour');
  });

  test('returns original text when targetLang is "fr"', async () => {
    const result = await translate('Bonjour', 'fr');
    expect(result).toBe('Bonjour');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('returns original text when circuit is OPEN', async () => {
    mockBreaker.getState.mockReturnValue(STATE.OPEN);
    const result = await translate('Bonjour', 'en');
    expect(result).toBe('Bonjour');
  });

  test('calls Claude API for non-fr target', async () => {
    mockApiFetch.mockResolvedValueOnce(makeClaudeOkRes('Hello'));
    const result = await translate('Bonjour', 'en');
    expect(result).toBe('Hello');
  });

  test('returns original text when API call throws', async () => {
    mockBreaker.exec.mockRejectedValueOnce(new Error('timeout'));
    const result = await translate('Bonjour', 'en');
    expect(result).toBe('Bonjour');
  });

  test('returns original text when content is empty in response', async () => {
    mockApiFetch.mockResolvedValueOnce(makeClaudeOkRes(''));
    const result = await translate('Bonjour', 'en');
    expect(result).toBe('Bonjour');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 195: json.content?.[0]?.text ?? '' — right-side (nullish coalescing) branch
// Triggered when Claude returns a response with no content field
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — line 195 ?? "" right-side branch (no content in response)', () => {
  test('falls back to rule-based when json has no content field', async () => {
    // json.content is undefined → json.content?.[0]?.text evaluates to undefined
    // → ?? '' right-side branch fires → raw = '' → JSON.parse('') throws → rule-based
    mockApiFetch.mockResolvedValueOnce({
      ok:   true,
      status: 200,
      json: async () => ({}),   // no content field
      text: async () => '',
    });
    const result = await analyze('Créer un rendez-vous demain');
    expect(result.strategy).toBe('rule-based');
  });

  test('falls back to rule-based when json.content[0] has no text field', async () => {
    // json.content[0].text is undefined → ?? '' right-side fires → JSON.parse('') throws
    mockApiFetch.mockResolvedValueOnce({
      ok:   true,
      status: 200,
      json: async () => ({ content: [{}] }),  // content[0] has no text
      text: async () => '',
    });
    const result = await analyze('Annuler mon rendez-vous');
    expect(result.strategy).toBe('rule-based');
  });
});
