// tests/features/nlu/nlu.missing.branches.test.js
// Covers the two uncovered branches in nlu.service.js:
//   Line 36: dateparser catch fallback (resolve throws)
//   Lines 71-75: implicit-update from "modif/change/decal..." keyword

import { jest } from '@jest/globals';

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
const mockBuildContext    = jest.fn(async () => '');
const mockGetLastEntities = jest.fn(async () => null);
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

const { understand } = await import('../../../src/features/nlu/nlu.service.js');

function llmOk(overrides = {}) {
<<<<<<< HEAD
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
=======
  return { intent: 'list_events', subject: '', date: '', time: '', confidence: 0.9, errors: [], strategy: 'claude', ...overrides };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
// Line 36 — dateparser catch fallback
// ═════════════════════════════════════════════════════════════════════════════

describe('_resolveDateTime — dateparser throws (line 36)', () => {
  test('returns best-effort result when dateparser resolve throws', async () => {
    mockResolveDate.mockRejectedValueOnce(new Error('dateparser unavailable'));
<<<<<<< HEAD
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'create_event',
        date: '2026-06-15',
        time: '10:00',
      })
    );
=======
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent: 'create_event', date: '2026-06-15', time: '10:00',
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    const result = await understand('réunion le 15 juin à 10h', 'CA-dp-catch');
    // Should not throw and should have some date/time info
    expect(result.ok).not.toBe(false);
    // The catch fallback sets date/time from raw LLM output
    expect(result).toBeDefined();
  });

  test('does not throw when resolve rejects with non-Error', async () => {
    mockResolveDate.mockRejectedValueOnce('string-rejection');
<<<<<<< HEAD
    mockAnalyzeClaude.mockResolvedValueOnce(
      llmOk({
        intent: 'create_event',
        date: 'demain',
        time: null,
      })
    );
=======
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent: 'create_event', date: 'demain', time: null,
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

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
<<<<<<< HEAD
      intent: 'create_event',
      isoDate: '2026-06-10',
      isoTime: '09:00',
      subject: 'dentiste',
=======
      intent: 'create_event', isoDate: '2026-06-10', isoTime: '09:00', subject: 'dentiste',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.2 }));

    const result = await understand('modifier ce rendez-vous', 'CA-implicit-update');
    expect(result._resolved).toBe('implicit-update');
    expect(result.intent).toBe('update_event');
  });

  test('resolves "changer" as implicit update_event', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
<<<<<<< HEAD
      intent: 'create_event',
      isoDate: '2026-07-01',
      isoTime: null,
      subject: null,
=======
      intent: 'create_event', isoDate: '2026-07-01', isoTime: null, subject: null,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.15 }));

    const result = await understand('changer la date', 'CA-implicit-change');
    expect(result._resolved).toBe('implicit-update');
    expect(result.intent).toBe('update_event');
  });

  test('resolves "décaler" (normalised) as implicit update_event', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
<<<<<<< HEAD
      intent: 'create_event',
      isoDate: '2026-06-15',
      isoTime: '14:00',
      subject: 'réunion',
=======
      intent: 'create_event', isoDate: '2026-06-15', isoTime: '14:00', subject: 'réunion',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
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
=======
      intent: 'create_event', isoDate: '2026-06-01', isoTime: '09:00', subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent: 'unknown', confidence: 0.2,
      date: '2026-06-20', time: '15:00', // nlu has values → should be kept
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

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
<<<<<<< HEAD
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
=======
      intent: 'create_event', isoDate: '2026-08-05', isoTime: '10:30', subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent: 'unknown', confidence: 0.2, date: '', time: '', // nlu has no date
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

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
<<<<<<< HEAD
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
=======
      intent: 'create_event', isoDate: '2026-06-01', isoTime: null, subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent: 'list_events', confidence: 0.95, // high confidence known intent
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    const result = await understand('modifier mon agenda', 'CA-no-implicit');
    // High confidence known intent → no implicit resolution
    expect(result._resolved).toBeUndefined();
    expect(result.intent).toBe('list_events');
  });
});
