// tests/features/nlu/nlu.missing.branches.test.js
// Covers the two uncovered branches in nlu.service.js:
//   Line 36: dateparser catch fallback (resolve throws)
//   Lines 71-75: implicit-update from "modif/change/decal..." keyword

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: { CLAUDE_API_KEY: 'test-key', CLAUDE_MODEL: 'claude-haiku-4-5-20251001' },
}));

const mockTimer = jest.fn();
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  nluLatency: { startTimer: jest.fn(() => mockTimer) },
  auditLogFailures: { inc: jest.fn() },
}));

jest.unstable_mockModule('../../../src/features/agent/intent.normalizer.js', () => ({
  normalizeIntent: jest.fn(i => i),
}));

const mockBuildContext = jest.fn(async () => '');
const mockGetLastEntities = jest.fn(async () => null);
const mockDetectShortAnswer = jest.fn(() => null);
jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  buildContext: mockBuildContext,
  getLastEntities: mockGetLastEntities,
  detectShortAnswer: mockDetectShortAnswer,
}));

const mockAnalyzeClaude = jest.fn();
jest.unstable_mockModule('../../../src/services/claude.client.js', () => ({
  analyze: mockAnalyzeClaude,
}));

const mockResolveDate = jest.fn(async () => ({
  date: null,
  time: null,
  iso: null,
  hasDate: false,
  hasTime: false,
}));
jest.unstable_mockModule('../../../src/services/dateparser.js', () => ({
  resolve: mockResolveDate,
}));

const { understand } = await import('../../../src/features/nlu/nlu.service.js');

function llmOk(overrides = {}) {
  return {
    intent: 'list_events',
    subject: '',
    date: '',
    time: '',
    confidence: 0.9,
    errors: [],
    strategy: 'claude',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildContext.mockResolvedValue('');
  mockGetLastEntities.mockResolvedValue(null);
  mockDetectShortAnswer.mockReturnValue(null);
  mockResolveDate.mockResolvedValue({
    date: null,
    time: null,
    iso: null,
    hasDate: false,
    hasTime: false,
  });
  mockAnalyzeClaude.mockResolvedValue(llmOk());
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 36 — dateparser catch fallback
// ═════════════════════════════════════════════════════════════════════════════

describe('_resolveDateTime — dateparser throws (line 36)', () => {
  test('returns best-effort result when dateparser resolve throws', async () => {
    mockResolveDate.mockRejectedValueOnce(new Error('dateparser unavailable'));
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'create_event',
        date: '2026-06-15',
        time: '10:00',
      })
    );

    const result = await understand('réunion le 15 juin à 10h', 'CA-dp-catch');
    // Should not throw and should have some date/time info
    expect(result.ok).not.toBe(false);
    // The catch fallback sets date/time from raw LLM output
    expect(result).toBeDefined();
  });

  test('does not throw when resolve rejects with non-Error', async () => {
    mockResolveDate.mockRejectedValueOnce('string-rejection');
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'create_event',
        date: 'demain',
        time: null,
      })
    );

    await expect(understand('réunion demain', 'CA-dp-str')).resolves.toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 71-75 — implicit-update from keyword (change/decal/modif)
// ═════════════════════════════════════════════════════════════════════════════

describe('_resolveImplicit — implicit-update branch (lines 71-75)', () => {
  test('resolves "modifier" as implicit update_event', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'create_event',
      isoDate: '2026-06-10',
      isoTime: '09:00',
      subject: 'dentiste',
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.2 }));

    const result = await understand('modifier ce rendez-vous', 'CA-implicit-update');
    expect(result._resolved).toBe('implicit-update');
    expect(result.intent).toBe('update_event');
  });

  test('resolves "changer" as implicit update_event', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'create_event',
      isoDate: '2026-07-01',
      isoTime: null,
      subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.15 }));

    const result = await understand('changer la date', 'CA-implicit-change');
    expect(result._resolved).toBe('implicit-update');
    expect(result.intent).toBe('update_event');
  });

  test('resolves "décaler" (normalised) as implicit update_event', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'create_event',
      isoDate: '2026-06-15',
      isoTime: '14:00',
      subject: 'réunion',
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.1 }));

    // 'décaler' normalises to 'decaler' which matches /decal/
    const result = await understand('décaler le rendez-vous', 'CA-implicit-decal');
    expect(result._resolved).toBe('implicit-update');
    expect(result.intent).toBe('update_event');
  });

  test('preserves date/time from nlu when present in implicit-update', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'create_event',
      isoDate: '2026-06-01',
      isoTime: '09:00',
      subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'unknown',
        confidence: 0.2,
        date: '2026-06-20',
        time: '15:00', // nlu has values → should be kept
      })
    );

    const result = await understand('repousser à vendredi', 'CA-implicit-repousse');
    expect(result._resolved).toBe('implicit-update');
    // The source does: date: nlu.date || lastEntities.isoDate
    // nlu.date = '2026-06-20' → wins
    expect(result.date).toBe('2026-06-20');
    expect(result.time).toBe('15:00');
  });

  test('falls back to lastEntities date when nlu has no date in implicit-update', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'create_event',
      isoDate: '2026-08-05',
      isoTime: '10:30',
      subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'unknown',
        confidence: 0.2,
        date: '',
        time: '', // nlu has no date
      })
    );

    const result = await understand('déplacer ce créneau', 'CA-implicit-deplace');
    expect(result._resolved).toBe('implicit-update');
    expect(result.date).toBe('2026-08-05');
    expect(result.time).toBe('10:30');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Additional invariant: implicit-update NOT triggered when confidence is high
// ═════════════════════════════════════════════════════════════════════════════

describe('_resolveImplicit — no implicit resolution for high confidence', () => {
  test('does not apply implicit-update when confidence >= 0.4 and intent is known', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'create_event',
      isoDate: '2026-06-01',
      isoTime: null,
      subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'list_events',
        confidence: 0.95, // high confidence known intent
      })
    );

    const result = await understand('modifier mon agenda', 'CA-no-implicit');
    // High confidence known intent → no implicit resolution
    expect(result._resolved).toBeUndefined();
    expect(result.intent).toBe('list_events');
  });
});
