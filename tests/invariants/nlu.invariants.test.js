// tests/invariants/nlu.invariants.test.js
// Structural invariants for the rule-based NLU (no API key → deterministic).
// For any input, the output shape is always valid and confidence is always in [0,1].

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    CLAUDE_API_KEY: '', // force rule-based — no API calls
    CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
  },
}));

jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordRequest: jest.fn(), recordFailure: jest.fn(),
  recordLatency: jest.fn(), setCircuitState: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/circuitBreaker.js', () => ({
  CircuitBreaker:   jest.fn(() => ({ exec: jest.fn(), getState: jest.fn(() => 'CLOSED') })),
  CircuitOpenError: class extends Error {},
  TimeoutError:     class extends Error {},
  HttpError:        class extends Error { constructor(s, m) { super(m); this.status = s; } },
  withRetry:        jest.fn(async (fn) => fn()),
  STATE:            { CLOSED: 'CLOSED', HALF_OPEN: 'HALF_OPEN', OPEN: 'OPEN' },
}));

const { analyze } = await import('../../src/services/claude.client.js');

const VALID_INTENTS = new Set(['create_event', 'cancel_event', 'update_event', 'list_events', 'unknown']);

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 1: Output shape is always complete for any non-empty text
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 1: analyze() always returns a complete valid shape', () => {
  const texts = [
    'Créer un rendez-vous demain à 14h30',
    'Annuler mon rendez-vous de lundi',
    'Modifier le rendez-vous du 15 juin',
    'Lister mes rendez-vous de la semaine',
    'Bonjour, comment ça va ?',
    'Pizza margherita avec des anchois',
    'book a meeting for tomorrow at 9am',
    'rendez-vous le 15/06 à 9:00',
    'réunion demain à 14h00',
    'delete my appointment please',
    'À',                // single accented character
    'x',               // minimal input
  ];

  test.each(texts)('shape is valid for "%s"', async (text) => {
    const r = await analyze(text);

    // Intent is always one of the valid enum values
    expect(VALID_INTENTS.has(r.intent)).toBe(true);

    // Confidence is always in [0, 1]
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);

    // Required string fields are always strings
    expect(typeof r.date).toBe('string');
    expect(typeof r.time).toBe('string');
    expect(typeof r.subject).toBe('string');

    // Errors is always an array
    expect(Array.isArray(r.errors)).toBe(true);

    // Strategy is always a string
    expect(typeof r.strategy).toBe('string');
    expect(r.strategy.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 2: Empty/null inputs always return intent:unknown with errors
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 2: empty/null inputs always return intent:unknown', () => {
  const emptyInputs = [
    ['null',       null],
    ['undefined',  undefined],
    ['empty string', ''],
    ['whitespace', '   '],
    ['tab',        '\t'],
  ];

  test.each(emptyInputs)('%s → intent:unknown', async (_label, input) => {
    const r = await analyze(input);
    expect(r.intent).toBe('unknown');
    expect(Array.isArray(r.errors)).toBe(true);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 3: analyze() NEVER throws — always resolves
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 3: analyze() never throws for null/undefined/empty string', () => {
  // Non-string primitives (number, boolean, object, array) are not valid inputs
  // and may throw — but null, undefined, and empty string must always resolve.
  const safeEdgeCases = [
    ['null',      null],
    ['undefined', undefined],
    ['empty',     ''],
    ['whitespace','   '],
  ];

  test.each(safeEdgeCases)('%s → resolves without throwing', async (_label, input) => {
    await expect(analyze(input)).resolves.toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 4: Strategy is always "rule-based" when no API key
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 4: strategy is always "rule-based" with no API key', () => {
  const textCases = [
    'créer un rendez-vous',
    'annuler',
    'modifier',
    'liste',
    'quelque chose d\'aléatoire',
    'Hello world',
    '12345',
  ];

  test.each(textCases)('strategy for "%s" is rule-based', async (text) => {
    const r = await analyze(text);
    expect(r.strategy).toBe('rule-based');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT 5: Known keywords always produce specific intents
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT 5: keyword → intent mapping is deterministic', () => {
  const keywordIntents = [
    ['créer un rendez-vous',    'create_event'],
    ['annuler mon rendez-vous', 'cancel_event'],
    ['modifier mon rendez-vous', 'update_event'],
    ['liste mes rendez-vous',   'list_events'],
  ];

  test.each(keywordIntents)('"%s" → intent="%s"', async (text, expectedIntent) => {
    const r = await analyze(text);
    expect(r.intent).toBe(expectedIntent);
  });
});
