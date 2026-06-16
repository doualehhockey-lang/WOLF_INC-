// tests/features/nlu/nlu.extra.branches.test.js
// Covers nlu.service.js remaining branch gaps:
//   Lines 52-54: ?? branches in confirm resolution (null lastEntities fields)
//   Line 90:     intent === 'update_event' branch of _getMissing
//   Lines 168-169: nlu.subject ?? '' and nlu.date ?? '' null defaults
//   Line 177:    nlu.errors ?? [] when nlu.errors is null/undefined

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
<<<<<<< HEAD
  config: { CLAUDE_API_KEY: 'test-key', CLAUDE_MODEL: 'claude-haiku-4-5-20251001' },
=======
  config: { CLAUDE_API_KEY: 'test-key', CLAUDE_MODEL: 'claude-haiku-4-5-20251001', OLLAMA_MODEL: 'llama3' },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

const mockTimer = jest.fn();
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  nluLatency: { startTimer: jest.fn(() => mockTimer) },
<<<<<<< HEAD
  auditLogFailures: { inc: jest.fn() },
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

jest.unstable_mockModule('../../../src/features/agent/intent.normalizer.js', () => ({
  normalizeIntent: jest.fn(i => i),
}));

<<<<<<< HEAD
const mockBuildContext = jest.fn(async () => '');
const mockGetLastEntities = jest.fn(async () => null);
const mockDetectShortAnswer = jest.fn(() => null);
jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  buildContext: mockBuildContext,
  getLastEntities: mockGetLastEntities,
=======
const mockBuildContext      = jest.fn(async () => '');
const mockGetLastEntities   = jest.fn(async () => null);
const mockDetectShortAnswer = jest.fn(() => null);
jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  buildContext:      mockBuildContext,
  getLastEntities:   mockGetLastEntities,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  detectShortAnswer: mockDetectShortAnswer,
}));

const mockAnalyzeClaude = jest.fn();
jest.unstable_mockModule('../../../src/services/claude.client.js', () => ({
  analyze: mockAnalyzeClaude,
}));

<<<<<<< HEAD
const mockResolveDate = jest.fn(async () => ({
  date: null,
  time: null,
  iso: null,
  hasDate: false,
  hasTime: false,
=======
jest.unstable_mockModule('../../../src/services/ollama.client.js', () => ({
  analyze: jest.fn(),
}));

const mockResolveDate = jest.fn(async () => ({
  date: null, time: null, iso: null, hasDate: false, hasTime: false,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));
jest.unstable_mockModule('../../../src/services/dateparser.js', () => ({
  resolve: mockResolveDate,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const { understand } = await import('../../../src/features/nlu/nlu.service.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function llmOk(overrides = {}) {
  return {
<<<<<<< HEAD
    intent: 'list_events',
    subject: '',
    date: '',
    time: '',
    confidence: 0.9,
    errors: [],
    strategy: 'claude',
=======
    intent: 'list_events', subject: '', date: '', time: '',
    confidence: 0.9, errors: [], strategy: 'claude',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildContext.mockResolvedValue('');
  mockGetLastEntities.mockResolvedValue(null);
  mockDetectShortAnswer.mockReturnValue(null);
<<<<<<< HEAD
  mockResolveDate.mockResolvedValue({
    date: null,
    time: null,
    iso: null,
    hasDate: false,
    hasTime: false,
  });
=======
  mockResolveDate.mockResolvedValue({ date: null, time: null, iso: null, hasDate: false, hasTime: false });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  mockAnalyzeClaude.mockResolvedValue(llmOk());
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 52-54: ?? branches in confirm resolution
// ═════════════════════════════════════════════════════════════════════════════

describe('_resolveImplicit — confirm ?? branches (lines 52-54)', () => {
  test('falls back to nlu.date when lastEntities.isoDate is null (line 52 right branch)', async () => {
    mockDetectShortAnswer.mockReturnValue('confirm');
    mockGetLastEntities.mockResolvedValueOnce({
<<<<<<< HEAD
      intent: 'create_event',
      isoDate: null, // null → ?? nlu.date
      isoTime: null, // null → ?? nlu.time
      subject: null, // null → ?? nlu.subject
    });
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'unknown',
        confidence: 0.9,
        date: 'demain',
        time: '10:00',
        subject: 'réunion',
      })
    );
=======
      intent:  'create_event',
      isoDate: null,        // null → ?? nlu.date
      isoTime: null,        // null → ?? nlu.time
      subject: null,        // null → ?? nlu.subject
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent: 'unknown', confidence: 0.9,
      date: 'demain', time: '10:00', subject: 'réunion',
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    const result = await understand('oui', 'CA-confirm-null-entities');
    expect(result._resolved).toBe('confirm');
    // nlu.date is 'demain' → used as fallback
    expect(result.date).toBe('demain');
    expect(result.time).toBe('10:00');
    expect(result.subject).toBe('réunion');
  });

  test('uses lastEntities values when they are non-null (line 52 left branch)', async () => {
    mockDetectShortAnswer.mockReturnValue('confirm');
    mockGetLastEntities.mockResolvedValueOnce({
<<<<<<< HEAD
      intent: 'create_event',
=======
      intent:  'create_event',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      isoDate: '2026-09-15',
      isoTime: '14:30',
      subject: 'dentiste',
    });
<<<<<<< HEAD
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'unknown',
        confidence: 0.9,
        date: 'demain',
        time: '10:00',
        subject: 'réunion',
      })
    );
=======
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent: 'unknown', confidence: 0.9,
      date: 'demain', time: '10:00', subject: 'réunion',
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    const result = await understand('oui', 'CA-confirm-entities');
    expect(result._resolved).toBe('confirm');
    // lastEntities.isoDate is '2026-09-15' → wins over nlu.date
    expect(result.date).toBe('2026-09-15');
    expect(result.time).toBe('14:30');
    expect(result.subject).toBe('dentiste');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 90: _getMissing — intent === 'update_event' OR branch
// ═════════════════════════════════════════════════════════════════════════════

describe('_getMissing — update_event missing date (line 90)', () => {
  test('adds "date" to missing when update_event has no date', async () => {
<<<<<<< HEAD
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'update_event',
        date: '',
        time: '',
        confidence: 0.9,
      })
    );
    mockResolveDate.mockResolvedValueOnce({
      date: null,
      time: null,
      iso: null,
      hasDate: false,
      hasTime: false,
=======
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent:     'update_event',
      date:       '',
      time:       '',
      confidence: 0.9,
    }));
    mockResolveDate.mockResolvedValueOnce({
      date: null, time: null, iso: null, hasDate: false, hasTime: false,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });

    const result = await understand('modifier mon rendez-vous', null);
    expect(result.intent).toBe('update_event');
    expect(result.missing).toContain('date');
    expect(result.needsClarification).toBe(true);
  });

  test('no missing for update_event when date is provided', async () => {
<<<<<<< HEAD
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'update_event',
        date: '2026-10-15',
        confidence: 0.9,
      })
    );
    mockResolveDate.mockResolvedValueOnce({
      date: '2026-10-15',
      time: null,
      iso: null,
      hasDate: true,
      hasTime: false,
=======
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent:     'update_event',
      date:       '2026-10-15',
      confidence: 0.9,
    }));
    mockResolveDate.mockResolvedValueOnce({
      date: '2026-10-15', time: null, iso: null, hasDate: true, hasTime: false,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });

    const result = await understand('modifier mon rendez-vous du 15 octobre', null);
    expect(result.intent).toBe('update_event');
    expect(result.missing).not.toContain('date');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 168-169, 177: ?? null defaults in understand() return value
// ═════════════════════════════════════════════════════════════════════════════

describe('understand() — ?? null defaults in return (lines 168-169, 177)', () => {
  test('returns empty string for subject when nlu.subject is null (line 168)', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce({
<<<<<<< HEAD
      intent: 'list_events',
      subject: null, // null → ?? '' right side
      date: null, // null → ?? '' right side (line 169)
      time: null,
      confidence: 0.9,
      errors: null, // null → ?? [] right side (line 177)
      strategy: 'claude',
=======
      intent:     'list_events',
      subject:    null,        // null → ?? '' right side
      date:       null,        // null → ?? '' right side (line 169)
      time:       null,
      confidence: 0.9,
      errors:     null,        // null → ?? [] right side (line 177)
      strategy:   'claude',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });

    const result = await understand('quels sont mes rendez-vous', null);
    expect(result.subject).toBe('');
    expect(result.date).toBe('');
    expect(result.errors).toEqual([]);
  });

  test('returns empty string for date when nlu.date is undefined (line 169)', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce({
<<<<<<< HEAD
      intent: 'list_events',
      subject: undefined, // undefined → ?? '' right side
      date: undefined, // undefined → ?? '' right side
      time: undefined,
      confidence: 0.9,
      errors: undefined, // undefined → ?? [] right side
      strategy: 'claude',
=======
      intent:     'list_events',
      subject:    undefined,   // undefined → ?? '' right side
      date:       undefined,   // undefined → ?? '' right side
      time:       undefined,
      confidence: 0.9,
      errors:     undefined,   // undefined → ?? [] right side
      strategy:   'claude',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });

    const result = await understand('liste mes événements', null);
    expect(result.subject).toBe('');
    expect(result.date).toBe('');
    expect(result.errors).toEqual([]);
  });

  test('returns errors array when nlu.errors is non-empty', async () => {
<<<<<<< HEAD
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        errors: ['validation-error'],
      })
    );
=======
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      errors: ['validation-error'],
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    const result = await understand('test message', null);
    // nlu.errors is non-null → ?? left side taken
    expect(result.errors).toEqual(['validation-error']);
  });
});
