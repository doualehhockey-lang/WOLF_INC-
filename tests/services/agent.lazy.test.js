// tests/services/agent.lazy.test.js
// Covers agent.js lazy-import branches:
<<<<<<< HEAD
//   Lines 79, 83, 87: ?? right sides (deps not provided → dynamic imports)
//   Line 126:         process(wavBuffer = null, opts = {}) default parameter
=======
//   Lines 79, 83, 87, 91: ?? right sides (deps not provided → dynamic imports)
//   Line 126:             process(wavBuffer = null, opts = {}) default parameter
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/services/metrics.js', () => ({
<<<<<<< HEAD
  recordAgentRequest: jest.fn(),
  recordAgentLatency: jest.fn(),
  recordAgentStageFailure: jest.fn(),
  recordPipelineSuccess: jest.fn(),
  auditLogFailures: { inc: jest.fn() },
}));

// Mock all three lazily-loaded client modules
=======
  recordAgentRequest:      jest.fn(),
  recordAgentLatency:      jest.fn(),
  recordAgentStageFailure: jest.fn(),
  recordPipelineSuccess:   jest.fn(),
}));

// Mock all four lazily-loaded client modules
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
const mockTranscribeWav = jest.fn(async () => 'transcription test');
jest.unstable_mockModule('../../src/services/whisper.client.js', () => ({
  transcribeWav: mockTranscribeWav,
}));

const mockClaudeAnalyze = jest.fn(async () => ({
<<<<<<< HEAD
  intent: 'list_events',
  subject: '',
  date: '',
  time: '',
  confidence: 0.9,
  errors: [],
  strategy: 'claude',
=======
  intent:     'list_events',
  subject:    '',
  date:       '',
  time:       '',
  confidence: 0.9,
  errors:     [],
  strategy:   'claude',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));
jest.unstable_mockModule('../../src/services/claude.client.js', () => ({
  analyze: mockClaudeAnalyze,
}));

<<<<<<< HEAD
const mockSynthesize = jest.fn(async () => ({
  buffer: Buffer.from('audio'),
  ext: 'mp3',
=======
const mockOllamaAnalyze = jest.fn(async () => ({
  intent:     'list_events',
  subject:    '',
  date:       '',
  time:       '',
  confidence: 0.9,
  errors:     [],
  strategy:   'ollama',
}));
jest.unstable_mockModule('../../src/services/ollama.client.js', () => ({
  analyze:  mockOllamaAnalyze,
  chat:     jest.fn(),
}));

const mockSynthesize = jest.fn(async () => ({
  buffer:   Buffer.from('audio'),
  ext:      'mp3',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  mimeType: 'audio/mpeg',
}));
jest.unstable_mockModule('../../src/services/tts.client.js', () => ({
  synthesize: mockSynthesize,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const { _makeAgent } = await import('../../src/services/agent.js');
<<<<<<< HEAD
=======
const { CircuitBreaker } = await import('../../src/services/circuitBreaker.js');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
<<<<<<< HEAD
// Lines 79, 83, 87: lazy-resolved defaults (no deps provided)
// ═════════════════════════════════════════════════════════════════════════════

describe('_makeAgent — lazy imports when no deps provided (lines 79, 83, 87)', () => {
  test('resolves all three client modules lazily when deps are omitted', async () => {
    // _makeAgent({}) → no deps → all three ?? right sides are taken
    const { process } = _makeAgent({});

    // Provide text to skip Whisper stage
    const result = await process(null, { text: 'quels sont mes rendez-vous' });

    // Pipeline succeeded → lazy-loaded mocks were called
    expect(result.ok).toBe(true);
    expect(mockClaudeAnalyze).toHaveBeenCalled();
=======
// Lines 79, 83, 87, 91: lazy-resolved defaults (no deps provided)
// ═════════════════════════════════════════════════════════════════════════════

describe('_makeAgent — lazy imports when no deps provided (lines 79, 83, 87, 91)', () => {
  test('resolves all four client modules lazily when deps are omitted', async () => {
    // _makeAgent({}) → no deps → all four ?? right sides are taken
    const { process } = _makeAgent({});

    // Provide text to skip Whisper stage (otherwise it uses transcribeWav with null buffer)
    const result = await process(null, { text: 'quels sont mes rendez-vous' });

    // Pipeline succeeded → all four lazy-loaded mocks were called
    expect(result.ok).toBe(true);
    // whisper is skipped when opts.text is provided (text path)
    // but claudeAnalyze, ollamaAnalyze, synthesize ARE resolved lazily
    expect(mockClaudeAnalyze).toHaveBeenCalled();
    expect(mockOllamaAnalyze).toHaveBeenCalled();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(mockSynthesize).toHaveBeenCalled();
  });

  test('lazy-resolved transcribeWav is called when wavBuffer is provided', async () => {
    const validWav = Buffer.alloc(100, 0);
    const { process } = _makeAgent({});

    const result = await process(validWav, {});

    expect(result.ok).toBe(true);
    // transcribeWav resolved lazily from whisper.client.js mock
    expect(mockTranscribeWav).toHaveBeenCalledWith(validWav, expect.objectContaining({}));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 126: process(wavBuffer = null, opts = {}) — default opts parameter
// ═════════════════════════════════════════════════════════════════════════════

describe('_makeAgent — process() default opts parameter (line 126)', () => {
  test('process(null) works without opts argument — uses default {}', async () => {
    const mockTwav = jest.fn(async () => 'bonjour');
    const { process } = _makeAgent({
      transcribeWav: mockTwav,
      claudeAnalyze: mockClaudeAnalyze,
<<<<<<< HEAD
      synthesize: mockSynthesize,
=======
      ollamaAnalyze: mockOllamaAnalyze,
      synthesize:    mockSynthesize,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });

    // Call without opts — triggers opts = {} default parameter branch
    const result = await process(null);

    // text is not in opts ({}) → transcription is null → tries transcribeWav(null)
<<<<<<< HEAD
=======
    // transcribeWav receives null buffer
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(mockTwav).toHaveBeenCalledWith(null, expect.objectContaining({}));
    expect(result.ok).toBe(true);
  });
});
