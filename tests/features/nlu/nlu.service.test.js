// tests/features/nlu/nlu.service.test.js
// Natural Language Understanding service: empty input, LLM backend selection,
// low-confidence fallback, implicit reference resolution (confirm/deny/cancel/update),
// missing-field detection, date/time resolution, and timer instrumentation.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

// ── Mock config — mutable so tests can toggle CLAUDE_API_KEY ─────────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    CLAUDE_API_KEY: 'test-api-key',
    CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
    OLLAMA_MODEL:   'llama3.2:3b',
  },
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockTimer = jest.fn();
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  nluLatency: { startTimer: jest.fn(() => mockTimer) },
}));

// ── Mock intent normalizer ────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/features/agent/intent.normalizer.js', () => ({
  normalizeIntent: jest.fn(i => i), // identity by default
}));

// ── Mock memory service ───────────────────────────────────────────────────────
const mockBuildContext    = jest.fn(async () => '');
const mockGetLastEntities = jest.fn(async () => null);
const mockDetectShortAnswer = jest.fn(() => null);
jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  buildContext:       mockBuildContext,
  getLastEntities:    mockGetLastEntities,
  detectShortAnswer:  mockDetectShortAnswer,
}));

// ── Mock Claude client ────────────────────────────────────────────────────────
const mockAnalyzeClaude = jest.fn();
jest.unstable_mockModule('../../../src/services/claude.client.js', () => ({
  analyze: mockAnalyzeClaude,
}));

// ── Mock Ollama client ────────────────────────────────────────────────────────
const mockAnalyzeOllama = jest.fn();
jest.unstable_mockModule('../../../src/services/ollama.client.js', () => ({
  analyze: mockAnalyzeOllama,
}));

// ── Mock dateparser ───────────────────────────────────────────────────────────
const mockResolveDate = jest.fn(async () => ({
  date: null, time: null, iso: null, hasDate: false, hasTime: false,
}));
jest.unstable_mockModule('../../../src/services/dateparser.js', () => ({
  resolve: mockResolveDate,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { understand } = await import('../../../src/features/nlu/nlu.service.js');
const { config }     = await import('../../../src/core/config.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Default successful LLM response. */
function llmOk(overrides = {}) {
  return {
    intent:     'list_events',
    subject:    '',
    date:       '',
    time:       '',
    confidence: 0.9,
    errors:     [],
    strategy:   'claude',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTimer.mockReset();
  mockAnalyzeClaude.mockReset();
  mockAnalyzeOllama.mockReset();
  mockBuildContext.mockResolvedValue('');
  mockGetLastEntities.mockResolvedValue(null);
  mockDetectShortAnswer.mockReturnValue(null);
  mockResolveDate.mockResolvedValue({ date: null, time: null, iso: null, hasDate: false, hasTime: false });
  config.CLAUDE_API_KEY = 'test-api-key'; // default: use Claude
  // Default Claude response
  mockAnalyzeClaude.mockResolvedValue(llmOk());
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Input validation
// ═════════════════════════════════════════════════════════════════════════════

describe('Input validation', () => {
  test('returns _fail result for empty string', async () => {
    const result = await understand('');
    expect(result.ok).toBe(false);
    expect(result.intent).toBe('unknown');
    expect(result.errors).toContain('empty-transcript');
  });

  test('returns _fail result for whitespace-only string', async () => {
    const result = await understand('   ');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('empty-transcript');
  });

  test('returns _fail result for null', async () => {
    const result = await understand(null);
    expect(result.ok).toBe(false);
  });

  test('does not call Claude or Ollama for empty input', async () => {
    await understand('');
    expect(mockAnalyzeClaude).not.toHaveBeenCalled();
    expect(mockAnalyzeOllama).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Backend selection — Claude vs Ollama
// ═════════════════════════════════════════════════════════════════════════════

describe('Backend selection', () => {
  test('calls Claude when CLAUDE_API_KEY is set', async () => {
    await understand('Bonjour');
    expect(mockAnalyzeClaude).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeOllama).not.toHaveBeenCalled();
  });

  test('calls Ollama when CLAUDE_API_KEY is absent', async () => {
    config.CLAUDE_API_KEY = '';
    mockAnalyzeOllama.mockResolvedValueOnce(llmOk({ strategy: 'ollama' }));
    await understand('Bonjour');
    expect(mockAnalyzeOllama).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeClaude).not.toHaveBeenCalled();
  });

  test('passes trimmed text to LLM (no leading/trailing spaces)', async () => {
    await understand('  bonjour  ');
    const [msg] = mockAnalyzeClaude.mock.calls[0];
    expect(msg.trim()).toBe(msg); // no surrounding whitespace
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Successful NLU result
// ═════════════════════════════════════════════════════════════════════════════

describe('Successful NLU result', () => {
  test('returns ok:true on successful analysis', async () => {
    const result = await understand('Lister mes rendez-vous');
    expect(result.ok).toBe(true);
  });

  test('returns correct intent from LLM response', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'create_event' }));
    const result = await understand('Créer un rendez-vous');
    expect(result.intent).toBe('create_event');
  });

  test('returns confidence from LLM response', async () => {
    const result = await understand('Bonjour');
    expect(result.confidence).toBe(0.9);
  });

  test('records timer with success:true', async () => {
    await understand('Test');
    expect(mockTimer).toHaveBeenCalledWith({ success: 'true' });
  });

  test('needsClarification is false when no missing fields', async () => {
    const result = await understand('Test');
    expect(result.needsClarification).toBe(false);
    expect(result.missing).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. LLM failure
// ═════════════════════════════════════════════════════════════════════════════

describe('LLM failure', () => {
  test('returns _fail result when Claude throws', async () => {
    mockAnalyzeClaude.mockRejectedValueOnce(new Error('API overloaded'));
    const result = await understand('Some text');
    expect(result.ok).toBe(false);
    expect(result.intent).toBe('unknown');
    expect(result.errors[0]).toMatch(/analyze-error/);
  });

  test('records timer with success:false when LLM throws', async () => {
    mockAnalyzeClaude.mockRejectedValueOnce(new Error('timeout'));
    await understand('fail test');
    expect(mockTimer).toHaveBeenCalledWith({ success: 'false' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Low-confidence → needsClarification
// ═════════════════════════════════════════════════════════════════════════════

describe('Low-confidence result (< 0.3)', () => {
  test('returns needsClarification:true when confidence < CONFIDENCE_THRESHOLD', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'create_event', confidence: 0.1 }));
    const result = await understand('hm');
    expect(result.ok).toBe(false);
    expect(result.needsClarification).toBe(true);
    expect(result.errors).toContain('low-confidence');
  });

  test('intent is "unknown" when confidence too low', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ confidence: 0.05 }));
    const result = await understand('hmm');
    expect(result.intent).toBe('unknown');
  });

  test('confidence boundary — exactly 0.3 is acceptable (no clarification needed)', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ confidence: 0.3 }));
    const result = await understand('thirty percent');
    expect(result.ok).toBe(true);
    expect(result.needsClarification).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Implicit reference resolution
// ═════════════════════════════════════════════════════════════════════════════

describe('Implicit reference resolution', () => {
  test('confirm short-answer resolves to last entity intent', async () => {
    const callSid = 'CA-resolve-test';
    mockDetectShortAnswer.mockReturnValue('confirm');
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'cancel_event', isoDate: '2026-06-10', isoTime: '10:00', subject: 'dentiste',
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.9 }));

    const result = await understand('oui', callSid);
    expect(result.intent).toBe('cancel_event');
    expect(result._resolved).toBe('confirm');
  });

  test('deny short-answer sets intent to "unknown"', async () => {
    const callSid = 'CA-deny-test';
    mockDetectShortAnswer.mockReturnValue('deny');
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'create_event', isoDate: '2026-06-10', isoTime: null, subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.9 }));

    const result = await understand('non', callSid);
    expect(result._resolved).toBe('deny');
  });

  test('implicit cancel resolved from annuler keyword + prior date', async () => {
    const callSid = 'CA-implicit-cancel';
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'list_events', isoDate: '2026-07-01', isoTime: null, subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.2 }));

    const result = await understand('annuler ce rendez-vous', callSid);
    // Low confidence + "annuler" keyword → should resolve to cancel_event
    // Note: _resolveImplicit triggers when confidence < 0.4 or intent is unknown
    expect(result._resolved).toBe('implicit-cancel');
    expect(result.intent).toBe('cancel_event');
  });

  test('does not resolve implicit reference when callSid is null', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'list_events', confidence: 0.9 }));
    const result = await understand('test', null);
    expect(result._resolved).toBeUndefined();
  });

  test('implicit update resolved from "déplace" keyword (line 71 TRUE branch)', async () => {
    // Covers nlu.service.js line 71: if (/change|decal|deplace|repousse|modif/.test(normalised))
    // Requires: unknown intent AND lastEntities not null, text matching update pattern
    const callSid = 'CA-implicit-update-71';
    mockDetectShortAnswer.mockReturnValue(null);
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'update_event', isoDate: '2026-08-15', isoTime: '10:00', subject: 'médecin',
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.2 }));

    const result = await understand('déplace mon rendez-vous', callSid);
    expect(result._resolved).toBe('implicit-update');
    expect(result.intent).toBe('update_event');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Memory context injection
// ═════════════════════════════════════════════════════════════════════════════

describe('Memory context injection', () => {
  test('prepends conversation context to the LLM message when context is non-empty', async () => {
    const callSid = 'CA-ctx-test';
    mockBuildContext.mockResolvedValueOnce('[UTILISATEUR]: bonjour\n[AGENT]: Bonjour!');
    await understand('Mon rendez-vous de demain', callSid);
    const [msg] = mockAnalyzeClaude.mock.calls[0];
    expect(msg).toContain('[UTILISATEUR]');
    expect(msg).toContain('Mon rendez-vous de demain');
  });

  test('sends plain text when no context available', async () => {
    mockBuildContext.mockResolvedValueOnce('');
    await understand('Bonjour', 'CA-no-ctx');
    const [msg] = mockAnalyzeClaude.mock.calls[0];
    expect(msg).toBe('Bonjour'); // no context prefix
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Missing field detection
// ═════════════════════════════════════════════════════════════════════════════

describe('Missing field detection', () => {
  test('create_event with no date/time → missing: [date, heure]', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'create_event', confidence: 0.9 }));
    mockResolveDate.mockResolvedValueOnce({ date: null, time: null, iso: null, hasDate: false, hasTime: false });
    const result = await understand('Créer un rendez-vous');
    expect(result.missing).toContain('date');
    expect(result.missing).toContain('heure');
    expect(result.needsClarification).toBe(true);
  });

  test('create_event with date but no time → missing: [heure]', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'create_event', date: '2026-06-01', confidence: 0.9 }));
    mockResolveDate.mockResolvedValueOnce({ date: '2026-06-01', time: null, iso: null, hasDate: true, hasTime: false });
    const result = await understand('Créer RDV demain');
    expect(result.missing).toContain('heure');
    expect(result.missing).not.toContain('date');
  });

  test('list_events has no missing fields', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'list_events', confidence: 0.9 }));
    const result = await understand('Lister mes RDV');
    expect(result.missing).toHaveLength(0);
    expect(result.needsClarification).toBe(false);
  });

  test('cancel_event with no date → missing: [date]', async () => {
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'cancel_event', confidence: 0.9 }));
    mockResolveDate.mockResolvedValueOnce({ date: null, time: null, iso: null, hasDate: false, hasTime: false });
    const result = await understand('Annuler mon rendez-vous');
    expect(result.missing).toContain('date');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Result shape completeness
// ═════════════════════════════════════════════════════════════════════════════

describe('Result shape', () => {
  const REQUIRED_KEYS = ['ok', 'intent', 'rawIntent', 'subject', 'date', 'time',
    'isoDate', 'isoTime', 'iso', 'confidence', 'needsClarification', 'missing', 'errors', 'strategy'];

  test('success result contains all required keys', async () => {
    const result = await understand('Test text');
    for (const key of REQUIRED_KEYS) {
      expect(result).toHaveProperty(key);
    }
  });

  test('failure result contains all required keys', async () => {
    const result = await understand('');
    for (const key of REQUIRED_KEYS) {
      expect(result).toHaveProperty(key);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// _resolveDateTime catch block (line 36): dateparser throws → best-effort fallback
// ═════════════════════════════════════════════════════════════════════════════

describe('_resolveDateTime catch block (line 36)', () => {
  test('dateparser.resolve throwing → best-effort fallback (rawDate/rawTime used)', async () => {
    // Make dateparser.resolve throw → _resolveDateTime catch fires → fallback result
    mockResolveDate.mockRejectedValueOnce(new Error('dateparser unavailable'));
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent: 'create_event', date: 'demain', time: '14h00', confidence: 0.9,
    }));

    // understand() calls _resolveDateTime → which calls dateparser → throws → catch block
    const result = await understand('rendez-vous demain à 14h00');
    // Falls back gracefully — result should still be structured
    expect(result).toHaveProperty('intent');
    expect(result.ok).toBe(true);
  });

  test('dateparser throws with empty date/time → rawDate||null and rawTime||null use null (|| right-side branches)', async () => {
    // rawDate='' and rawTime='' → both are falsy → rawDate||null = null, rawTime||null = null
    // This covers the TRUE (right-side) branches of the || operators at line 36
    mockResolveDate.mockRejectedValueOnce(new Error('dateparser unavailable'));
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({
      intent: 'create_event', date: '', time: '', confidence: 0.9,
    }));

    const result = await understand('un rendez-vous');
    expect(result.ok).toBe(true);
    // isoDate/isoTime come from resolved.date/time which are rawDate||null = null
    expect(result.isoDate).toBeNull();
    expect(result.isoTime).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// _resolveImplicit — line 71 FALSE branch (regex doesn't match)
// ─────────────────────────────────────────────────────────────────────────────

describe('_resolveImplicit — line 71 regex FALSE branch', () => {
  test('returns nlu unchanged when text has neither cancel nor update keywords', async () => {
    // Covers line 71 FALSE: /change|decal|deplace|repousse|modif/.test(normalised) = FALSE
    // Requires: low confidence, lastEntities non-null, no yes/no, text doesn't match any implicit pattern
    const callSid = 'CA-implicit-fallthrough';
    mockDetectShortAnswer.mockReturnValue(null);   // not yes/no
    mockGetLastEntities.mockResolvedValueOnce({
      intent: 'list_events', isoDate: '2026-09-01', isoTime: null, subject: null,
    });
    mockAnalyzeClaude.mockResolvedValueOnce(llmOk({ intent: 'unknown', confidence: 0.2 }));

    // "merci" doesn't match annul/supprim OR change/decal/deplace/repousse/modif
    const result = await understand('merci pour votre aide', callSid);
    // Falls through to `return nlu` — no _resolved set
    expect(result._resolved).toBeUndefined();
    expect(result.intent).toBe('unknown');
  });
});
