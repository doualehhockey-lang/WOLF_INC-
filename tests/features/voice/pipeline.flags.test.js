// tests/features/voice/pipeline.flags.test.js
// Covers kill-switch branches wired in pipeline.js:
//   - PIPELINE_VOICE=false → disabled TwiML response
//   - MEMORY_CONTEXT=false → addUserTurn/addAgentTurn skipped
//   - TRANSLATION=false    → _translate returns original text immediately

import { jest } from '@jest/globals';

// ── Controllable featureFlags mock ─────────────────────────────────────────────
const _flags = {};
const mockIsEnabled = jest.fn(async (flag) => _flags[flag] ?? true);

jest.unstable_mockModule('../../../src/core/featureFlags.js', () => ({
  isEnabled: mockIsEnabled,
  FLAGS: {
    PIPELINE_VOICE: 'pipeline.voice', PIPELINE_SMS:  'pipeline.sms',
    MEMORY_CONTEXT: 'memory.context', TRANSLATION:   'translation',
    CLAUDE_NLU:     'claude.nlu',     OLLAMA_NLU:    'ollama.nlu',
    TTS_ELEVENLABS: 'tts.elevenlabs', TTS_AZURE:     'tts.azure',
    TTS_PIPER:      'tts.piper',      RATE_LIMIT:    'rate-limit',
    OTEL_TRACES:    'otel.traces',    AUDIT_LOG:     'audit.log',
    MEMORY_CONTEXT: 'memory.context', TRANSLATION:   'translation',
  },
  setFlag: jest.fn(), getAllFlags: jest.fn(async () => ({})),
  snapshotFlags: jest.fn(() => ({})), clearCache: jest.fn(),
}));

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: { BASE_URL: 'http://localhost:3000', AUDIO_DIR: '/tmp/audio' },
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  pipelineLatency: { startTimer: jest.fn(() => jest.fn()) },
  errorCounter:    { inc: jest.fn() },
  activeSessions:  { set: jest.fn() },
  rateLimitCounter: { inc: jest.fn() },
}));

const mockAddUserTurn  = jest.fn(async () => {});
const mockAddAgentTurn = jest.fn(async () => {});
jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  addUserTurn:  mockAddUserTurn,
  addAgentTurn: mockAddAgentTurn,
  getStats:     jest.fn(() => ({ activeSessions: 0 })),
}));

jest.unstable_mockModule('../../../src/features/nlu/nlu.service.js', () => ({
  understand: jest.fn(async () => ({
    intent: 'unknown', subject: '', date: '', time: '',
    confidence: 0.5, errors: [], missing: [],
  })),
}));

jest.unstable_mockModule('../../../src/features/agent/agent.service.js', () => ({
  dispatch: jest.fn(async () => ({ ok: true, message: 'OK' })),
}));

jest.unstable_mockModule('../../../src/features/tts/tts.service.js', () => ({
  synthesize: jest.fn(async () => ({ buffer: Buffer.from('x'), ext: '.wav', mimeType: 'audio/wav', fallback: false })),
}));

jest.unstable_mockModule('../../../src/features/lang/lang.service.js', () => ({
  detectLang:   jest.fn(() => 'en'), // non-FR → triggers _translate
  twilioLocale: jest.fn(() => 'en-US'),
}));

jest.unstable_mockModule('../../../src/features/voice/twiml.builder.js', () => ({
  twimlSayThenGather:  jest.fn((msg) => `<Say>${msg}</Say>`),
  twimlPlayThenGather: jest.fn((url) => `<Play>${url}</Play>`),
  twimlError:          jest.fn(() => '<Error/>'),
}));

jest.unstable_mockModule('../../../src/services/claude.client.js', () => ({
  translate: jest.fn(async (text) => `[translated] ${text}`),
  analyze:   jest.fn(),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { runPipeline } = await import('../../../src/features/voice/pipeline.js');

const CTX      = { text: 'hello', callSid: 'CA999', from: '+15005550000' };
const saveAudio = jest.fn(async () => ({ filename: 'out.wav' }));

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(_flags).forEach(k => delete _flags[k]);
});

// ── PIPELINE_VOICE kill switch ────────────────────────────────────────────────

describe('PIPELINE_VOICE=false kill switch', () => {
  test('returns disabled TwiML without running NLU', async () => {
    _flags['pipeline.voice'] = false;
    const result = await runPipeline(CTX, saveAudio);
    expect(result).toMatch(/Service vocal temporairement indisponible/);
    expect(result).toMatch(/<Say>/); // twimlSayThenGather returns <Say>
  });

  test('does NOT call addUserTurn when voice is disabled', async () => {
    _flags['pipeline.voice'] = false;
    await runPipeline(CTX, saveAudio);
    expect(mockAddUserTurn).not.toHaveBeenCalled();
  });
});

// ── MEMORY_CONTEXT kill switch ────────────────────────────────────────────────

describe('MEMORY_CONTEXT=false kill switch', () => {
  test('skips addUserTurn when memory is disabled', async () => {
    _flags['memory.context'] = false;
    await runPipeline(CTX, saveAudio);
    expect(mockAddUserTurn).not.toHaveBeenCalled();
  });

  test('skips addAgentTurn on agent dispatch when memory is disabled', async () => {
    _flags['memory.context'] = false;
    await runPipeline(CTX, saveAudio);
    expect(mockAddAgentTurn).not.toHaveBeenCalled();
  });

  test('memory enabled → both addUserTurn and addAgentTurn are called', async () => {
    // default: all flags true
    await runPipeline(CTX, saveAudio);
    expect(mockAddUserTurn).toHaveBeenCalled();
    expect(mockAddAgentTurn).toHaveBeenCalled();
  });
});

// ── TRANSLATION kill switch ───────────────────────────────────────────────────

describe('TRANSLATION=false kill switch', () => {
  test('returns un-translated response when translation is disabled', async () => {
    _flags['translation'] = false;
    const { translate } = await import('../../../src/services/claude.client.js');
    await runPipeline(CTX, saveAudio);
    // translate() should NOT be called because TRANSLATION flag is false
    expect(translate).not.toHaveBeenCalled();
  });

  test('calls translate when TRANSLATION is enabled (default)', async () => {
    const { translate } = await import('../../../src/services/claude.client.js');
    await runPipeline(CTX, saveAudio);
    // lang is 'en' (non-FR) — translate should be called
    expect(translate).toHaveBeenCalled();
  });
});
