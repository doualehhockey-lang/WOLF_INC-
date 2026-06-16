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
<<<<<<< HEAD
  auditLogFailures: { inc: jest.fn() },
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
<<<<<<< HEAD
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
=======
    CLAUDE_API_KEY: '',   // no Claude → uses Ollama fallback
    OLLAMA_MODEL:   'llama3.2:3b',
    CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
  },
}));

// Mock Ollama client — returns low confidence to allow _resolveImplicit to trigger
const mockOllamaAnalyze = jest.fn(async () => ({
  intent:     'unknown',
  confidence: 0.2,   // < 0.4 → triggers implicit branch
  subject:    '',
  date:       '',
  time:       '',
  errors:     [],
  strategy:   'ollama',
}));
jest.unstable_mockModule('../../../src/services/ollama.client.js', () => ({
  analyze: mockOllamaAnalyze,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// Mock dateparser — throw to cover line 36 catch block
const mockDateparserResolve = jest.fn(async () => {
  throw new Error('dateparser unavailable');
});
jest.unstable_mockModule('../../../src/services/dateparser.js', () => ({
  resolve: mockDateparserResolve,
}));

// Mock memory service — provides lastEntities for implicit resolution
<<<<<<< HEAD
const mockDetectShortAnswer = jest.fn(() => null);
const mockGetLastEntities = jest.fn(async () => ({
  intent: 'update_event',
=======
const mockDetectShortAnswer = jest.fn(() => null);  // no yes/no answer
const mockGetLastEntities   = jest.fn(async () => ({
  intent:  'update_event',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  isoDate: '2026-10-15',
  isoTime: '09:00',
  subject: 'médecin',
}));

jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
<<<<<<< HEAD
  buildContext: jest.fn(async () => ''),
  getLastEntities: mockGetLastEntities,
  detectShortAnswer: mockDetectShortAnswer,
}));

jest.unstable_mockModule('../../../src/features/agent/intent.normalizer.js', () => ({
  normalizeIntent: i => i,
=======
  buildContext:       jest.fn(async () => ''),
  getLastEntities:    mockGetLastEntities,
  detectShortAnswer:  mockDetectShortAnswer,
}));

// Mock intent.normalizer
jest.unstable_mockModule('../../../src/features/agent/intent.normalizer.js', () => ({
  normalizeIntent: (i) => i,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

const { understand } = await import('../../../src/features/nlu/nlu.service.js');

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 71: _resolveImplicit — implicit-update branch
// ═════════════════════════════════════════════════════════════════════════════

describe('_resolveImplicit — implicit-update branch (line 71)', () => {
  test('resolves "change" keyword to update_event when confidence < 0.4', async () => {
<<<<<<< HEAD
    mockDetectShortAnswer.mockReturnValue(null);
    mockClaudeAnalyze.mockResolvedValueOnce({
      intent: 'unknown',
      confidence: 0.2,
      subject: '',
      date: '',
      time: '',
      errors: [],
      strategy: 'claude',
=======
    // Ollama returns low-confidence unknown, text has "change" → line 71 TRUE
    mockDetectShortAnswer.mockReturnValue(null);  // not a yes/no
    mockOllamaAnalyze.mockResolvedValueOnce({
      intent: 'unknown', confidence: 0.2, subject: '', date: '', time: '',
      errors: [], strategy: 'ollama',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });

    const result = await understand('change le rendez-vous', 'sid-implicit-update');

    expect(result.intent).toBe('update_event');
    expect(result._resolved).toBe('implicit-update');
  });

  test('resolves "déplace" keyword to update_event via normalised text (line 71)', async () => {
    mockDetectShortAnswer.mockReturnValue(null);
<<<<<<< HEAD
    mockClaudeAnalyze.mockResolvedValueOnce({
      intent: 'unknown',
      confidence: 0.15,
      subject: '',
      date: '',
      time: '',
      errors: [],
      strategy: 'claude',
    });

=======
    mockOllamaAnalyze.mockResolvedValueOnce({
      intent: 'unknown', confidence: 0.15, subject: '', date: '', time: '',
      errors: [], strategy: 'ollama',
    });

    // "déplace" with accent — normalised removes accents → "deplace" matches regex
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
    mockClaudeAnalyze.mockResolvedValueOnce({
      intent: 'create_event',
      confidence: 0.9,
      subject: 'réunion',
      date: 'demain',
      time: '10h00',
      errors: [],
      strategy: 'claude',
=======
    // The dateparser mock always throws → line 36 (catch body) is executed
    // Ollama returns a date string to exercise _resolveDateTime
    mockOllamaAnalyze.mockResolvedValueOnce({
      intent: 'create_event', confidence: 0.9, subject: 'réunion',
      date: 'demain', time: '10h00', errors: [], strategy: 'ollama',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });

    const result = await understand('créer une réunion demain à 10h', 'sid-dateparser-throw');

<<<<<<< HEAD
=======
    // Should not throw — line 36 catch provides best-effort values
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(result.ok).toBe(true);
    expect(result.intent).toBe('create_event');
  });
});
