// tests/features/voice/pipeline.branches.test.js
// Covers pipeline.js remaining branch gaps:
//   Line 130: subject ? ` (${subject})` : '' — TRUE branch (non-empty subject)
//   Line 136: if (missing.includes('heure')) — TRUE branch (only heure missing)

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: { BASE_URL: 'http://localhost:3000', AUDIO_DIR: '/tmp/audio' },
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  pipelineLatency: { startTimer: jest.fn(() => jest.fn()) },
  errorCounter: { inc: jest.fn() },
  activeSessions: { set: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
}));

const mockUnderstand = jest.fn();
jest.unstable_mockModule('../../../src/features/nlu/nlu.service.js', () => ({
  understand: mockUnderstand,
}));

const mockDispatch = jest.fn();
jest.unstable_mockModule('../../../src/features/agent/agent.service.js', () => ({
  dispatch: mockDispatch,
}));

const mockSynthesize = jest.fn();
jest.unstable_mockModule('../../../src/features/tts/tts.service.js', () => ({
  synthesize: mockSynthesize,
}));

jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  addUserTurn: jest.fn(async () => {}),
  addAgentTurn: jest.fn(async () => {}),
  getSession: jest.fn(async () => ({ turns: [] })),
  getStats: jest.fn(() => ({ activeSessions: 0 })),
}));

jest.unstable_mockModule('../../../src/features/voice/conversation.service.js', () => ({
  converse: jest.fn(async () => {
    throw new Error('converse-disabled');
  }),
}));

jest.unstable_mockModule('../../../src/features/lang/lang.service.js', () => ({
  detectLang: jest.fn(() => 'fr'),
  twilioLocale: jest.fn(() => 'fr-FR'),
}));

const mockTwimlSay = jest.fn(msg => `<Say>${msg}</Say>`);
jest.unstable_mockModule('../../../src/features/voice/twiml.builder.js', () => ({
  twimlSayThenGather: mockTwimlSay,
  twimlPlayThenGather: jest.fn(url => `<Play>${url}</Play>`),
  twimlError: jest.fn(() => '<Error/>'),
}));

jest.unstable_mockModule('../../../src/services/claude.client.js', () => ({
  translate: jest.fn(async text => text),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const { runPipeline } = await import('../../../src/features/voice/pipeline.js');

const CTX = { text: 'test', callSid: 'CA-branches-test', from: '+33600000001' };
const saveAudio = jest.fn(async () => ({ filename: 'audio.wav' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSynthesize.mockResolvedValue({
    buffer: Buffer.alloc(44),
    ext: '.wav',
    mimeType: 'audio/wav',
  });
  mockDispatch.mockResolvedValue({ ok: true, message: 'Ok' });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 130 + 136: subject TRUE + only 'heure' missing
// ═════════════════════════════════════════════════════════════════════════════

describe('_buildMissingQuestion — heure-only missing with subject (lines 130, 136)', () => {
  test('generates "What time..." question when only heure is missing and subject is set', async () => {
    mockUnderstand.mockResolvedValueOnce({
      ok: true,
      intent: 'create_event',
      rawIntent: 'create_event',
      subject: 'médecin', // truthy → line 130 TRUE branch
      date: '2026-10-01',
      time: '',
      isoDate: '2026-10-01',
      isoTime: null,
      iso: null,
      confidence: 0.9,
      needsClarification: true,
      missing: ['heure'], // only heure → line 136 TRUE branch
      errors: [],
      strategy: 'claude',
    });

    const twiml = await runPipeline(CTX, saveAudio);

    // _buildMissingQuestion passes the question to _sayOrPlay → synthesize(question, locale)
    const synthArg = mockSynthesize.mock.calls[0]?.[0] ?? '';
    expect(synthArg).toContain('heure');
    expect(synthArg).toContain('médecin');
    expect(twiml).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 130: subject TRUE — with 'date' missing
// ═════════════════════════════════════════════════════════════════════════════

describe('_buildMissingQuestion — subject TRUE with date missing (line 130)', () => {
  test('includes subject in "What day..." question', async () => {
    mockUnderstand.mockResolvedValueOnce({
      ok: true,
      intent: 'create_event',
      rawIntent: 'create_event',
      subject: 'dentiste', // truthy → line 130 TRUE branch
      date: '',
      time: '',
      isoDate: null,
      isoTime: null,
      iso: null,
      confidence: 0.9,
      needsClarification: true,
      missing: ['date'],
      errors: [],
      strategy: 'claude',
    });

    const twiml = await runPipeline(CTX, saveAudio);
    const synthArg = mockSynthesize.mock.calls[0]?.[0] ?? '';
    expect(synthArg).toContain('dentiste');
    expect(synthArg).toContain('jour');
    expect(twiml).toBeDefined();
  });
});
