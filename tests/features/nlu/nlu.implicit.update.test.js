// tests/features/nlu/nlu.implicit.update.test.js
// Covers nlu.service.js:
//   Line 71: _resolveImplicit implicit-update branch (/change|decal|.../ matches)
//   Line 36: _resolveDateTime catch block (dateparser import throws)

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  nluLatency: { startTimer: jest.fn(() => jest.fn()) },
  auditLogFailures: { inc: jest.fn() },
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    CLAUDE_API_KEY: 'test-key',
    CLAUDE_MODEL: 'claude-haiku-4-5-20251001',
  },
}));

// Mock Claude client — returns low confidence to allow _resolveImplicit to trigger
const mockClaudeAnalyze = jest.fn(async () => ({
  intent: 'unknown',
  confidence: 0.2, // < 0.4 → triggers implicit branch
  subject: '',
  date: '',
  time: '',
  errors: [],
  strategy: 'claude',
}));
jest.unstable_mockModule('../../../src/services/claude.client.js', () => ({
  analyze: mockClaudeAnalyze,
}));

// Mock dateparser — throw to cover line 36 catch block
const mockDateparserResolve = jest.fn(async () => {
  throw new Error('dateparser unavailable');
});
jest.unstable_mockModule('../../../src/services/dateparser.js', () => ({
  resolve: mockDateparserResolve,
}));

// Mock memory service — provides lastEntities for implicit resolution
const mockDetectShortAnswer = jest.fn(() => null);
const mockGetLastEntities = jest.fn(async () => ({
  intent: 'update_event',
  isoDate: '2026-10-15',
  isoTime: '09:00',
  subject: 'médecin',
}));

jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  buildContext: jest.fn(async () => ''),
  getLastEntities: mockGetLastEntities,
  detectShortAnswer: mockDetectShortAnswer,
}));

jest.unstable_mockModule('../../../src/features/agent/intent.normalizer.js', () => ({
  normalizeIntent: i => i,
}));

const { understand } = await import('../../../src/features/nlu/nlu.service.js');

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 71: _resolveImplicit — implicit-update branch
// ═════════════════════════════════════════════════════════════════════════════

describe('_resolveImplicit — implicit-update branch (line 71)', () => {
  test('resolves "change" keyword to update_event when confidence < 0.4', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockClaudeAnalyze.mockResolvedValueOnce({
      intent: 'unknown',
      confidence: 0.2,
      subject: '',
      date: '',
      time: '',
      errors: [],
      strategy: 'claude',
    });

    const result = await understand('change le rendez-vous', 'sid-implicit-update');

    expect(result.intent).toBe('update_event');
    expect(result._resolved).toBe('implicit-update');
  });

  test('resolves "déplace" keyword to update_event via normalised text (line 71)', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
    mockClaudeAnalyze.mockResolvedValueOnce({
      intent: 'unknown',
      confidence: 0.15,
      subject: '',
      date: '',
      time: '',
      errors: [],
      strategy: 'claude',
    });

    const result = await understand('déplace mon rendez-vous', 'sid-implicit-deplace');
    expect(result.intent).toBe('update_event');
    expect(result._resolved).toBe('implicit-update');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 36: _resolveDateTime — catch block when dateparser throws
// ═════════════════════════════════════════════════════════════════════════════

describe('_resolveDateTime — dateparser catch (line 36)', () => {
  test('returns best-effort result when dateparser throws', async () => {
    mockClaudeAnalyze.mockResolvedValueOnce({
      intent: 'create_event',
      confidence: 0.9,
      subject: 'réunion',
      date: 'demain',
      time: '10h00',
      errors: [],
      strategy: 'claude',
    });

    const result = await understand('créer une réunion demain à 10h', 'sid-dateparser-throw');

    expect(result.ok).toBe(true);
    expect(result.intent).toBe('create_event');
  });
});
