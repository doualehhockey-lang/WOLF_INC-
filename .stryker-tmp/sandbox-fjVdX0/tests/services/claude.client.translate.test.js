// @ts-nocheck
// tests/services/claude.client.translate.test.js
// Covers claude.client.js:
//   Line 231: translate() function — targetLang !== 'fr' branch (API call path)
//   Line 233: translate() — targetLang === 'fr' returns early
//   Lines 199-203: analyze() — JSON parse failure in inner try/catch → _ruleBased fallback
//   Lines 207-213: analyze() — parsed fields with ?? fallback defaults

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const cfg = {
  CLAUDE_API_KEY: 'sk-translate-key',
  CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
};

jest.unstable_mockModule('../../src/core/config.js', () => ({ config: cfg }));

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

const { analyze, translate } = await import('../../src/services/claude.client.js');

function makeOkRes(text) {
  return {
    ok: true, status: 200,
    json:  async () => ({ content: [{ text }] }),
    text:  async () => text,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  cfg.CLAUDE_API_KEY = 'sk-translate-key';
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 231: translate — non-fr target language (API called)
// ═════════════════════════════════════════════════════════════════════════════

describe('translate — non-fr targetLang (line 231)', () => {
  test('calls API and returns translated text when targetLang is "en"', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes('Hello, your appointment is confirmed.'));

    const result = await translate('Bonjour, votre rendez-vous est confirmé.', 'en');
    expect(result).toBe('Hello, your appointment is confirmed.');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  test('returns original text when API call fails during translate', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network error'));

    const result = await translate('Bonjour', 'en');
    // Falls back to original text on error
    expect(result).toBe('Bonjour');
  });

  test('returns original text when content is empty', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes(''));

    const result = await translate('test', 'de');
    // Empty text response → falls back to original
    expect(result).toBe('test');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 233: translate — 'fr' targetLang returns early
// ═════════════════════════════════════════════════════════════════════════════

describe('translate — fr targetLang returns early (line 233)', () => {
  test('returns original text without API call when targetLang is "fr"', async () => {
    const result = await translate('Bonjour le monde', 'fr');
    expect(result).toBe('Bonjour le monde');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('returns original text without API call when targetLang is omitted (default fr)', async () => {
    const result = await translate('Bonjour le monde');
    expect(result).toBe('Bonjour le monde');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 199-203: analyze — inner JSON parse failure → _ruleBased fallback
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — JSON parse failure (lines 199-203)', () => {
  test('returns rule-based result when API returns non-JSON text', async () => {
    // API returns plain text, not parseable JSON
    mockApiFetch.mockResolvedValueOnce(makeOkRes('Je ne peux pas analyser cela.'));

    const result = await analyze("créer un rendez-vous demain");
    // Falls back to _ruleBased → strategy should be 'rule-based'
    expect(result.strategy).toBe('rule-based');
  });

  test('returns rule-based result when API returns partially valid JSON', async () => {
    // Incomplete JSON → JSON.parse throws
    mockApiFetch.mockResolvedValueOnce(makeOkRes('{"intent": "create_event", broken'));

    const result = await analyze('rendez-vous');
    expect(result.strategy).toBe('rule-based');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 207-213: analyze — parsed ?? fallback defaults
// ═════════════════════════════════════════════════════════════════════════════

describe('analyze — parsed field ?? fallbacks (lines 207-213)', () => {
  test('uses "unknown" when parsed.intent is null/undefined', async () => {
    // Return JSON with no intent field → ?? 'unknown' right side (line 207)
    mockApiFetch.mockResolvedValueOnce(makeOkRes(JSON.stringify({
      confidence: 0.5, errors: [], strategy: 'claude',
      // no intent, subject, date, time
    })));

    const result = await analyze('bonjour');
    expect(result.intent).toBe('unknown');      // ?? 'unknown' right side
    expect(result.subject).toBe('');             // ?? '' right side
    expect(result.date).toBe('');                // ?? '' right side
    expect(result.time).toBe('');                // ?? '' right side
  });

  test('uses 0.8 when parsed.confidence is not a number', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes(JSON.stringify({
      intent: 'list_events', errors: [], strategy: 'claude',
      confidence: 'high',   // not a number → uses 0.8 default (line 211)
    })));

    const result = await analyze('mes rendez-vous');
    expect(result.confidence).toBe(0.8);
  });

  test('uses empty array when parsed.errors is null', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes(JSON.stringify({
      intent: 'list_events', confidence: 0.9, strategy: 'claude',
      // no errors field
    })));

    const result = await analyze('liste rendez-vous');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors).toHaveLength(0);   // ?? [] right side
  });

  test('uses "claude" when parsed.strategy is null', async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkRes(JSON.stringify({
      intent: 'list_events', confidence: 0.9, errors: [],
      // no strategy field → ?? 'claude' right side
    })));

    const result = await analyze('afficher rendez-vous');
    expect(result.strategy).toBe('claude');   // ?? 'claude' right side (line 213)
  });
});
