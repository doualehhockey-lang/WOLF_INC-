// tests/chaos/pipeline.chaos.test.js
// Chaos tests: voice pipeline must always return valid TwiML regardless of failure mode.
// Failure modes: NLU error, agent error, TTS/disk error, agent bad shape.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
<<<<<<< HEAD
    BASE_URL: 'http://localhost:3000',
    AUDIO_DIR: './public/audio',
    NODE_ENV: 'test',
=======
    BASE_URL:  'http://localhost:3000',
    AUDIO_DIR: './public/audio',
    NODE_ENV:  'test',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
}));

jest.unstable_mockModule('../../src/core/metrics.js', () => ({
  pipelineLatency: { startTimer: jest.fn(() => jest.fn()) },
<<<<<<< HEAD
  errorCounter: { inc: jest.fn() },
  activeSessions: { set: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
=======
  errorCounter:    { inc: jest.fn() },
  activeSessions:  { set: jest.fn() },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

const mockUnderstand = jest.fn();
jest.unstable_mockModule('../../src/features/nlu/nlu.service.js', () => ({
  understand: mockUnderstand,
}));

const mockDispatch = jest.fn();
jest.unstable_mockModule('../../src/features/agent/agent.service.js', () => ({
  dispatch: mockDispatch,
}));

const mockSynthesize = jest.fn();
jest.unstable_mockModule('../../src/features/tts/tts.service.js', () => ({
  synthesize: mockSynthesize,
}));

jest.unstable_mockModule('../../src/features/memory/memory.service.js', () => ({
<<<<<<< HEAD
  addUserTurn: jest.fn(async () => {}),
  addAgentTurn: jest.fn(async () => {}),
  getSession: jest.fn(async () => ({ turns: [] })),
  getStats: jest.fn(() => ({ activeSessions: 1 })),
}));

jest.unstable_mockModule('../../src/features/voice/conversation.service.js', () => ({
  converse: jest.fn(async () => {
    throw new Error('converse-disabled');
  }),
}));

jest.unstable_mockModule('../../src/features/lang/lang.service.js', () => ({
  detectLang: jest.fn(() => 'fr'),
=======
  addUserTurn:  jest.fn(async () => {}),
  addAgentTurn: jest.fn(async () => {}),
  getStats:     jest.fn(() => ({ activeSessions: 1 })),
}));

jest.unstable_mockModule('../../src/features/lang/lang.service.js', () => ({
  detectLang:   jest.fn(() => 'fr'),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  twilioLocale: jest.fn(() => 'fr-FR'),
}));

jest.unstable_mockModule('../../src/features/voice/twiml.builder.js', () => ({
<<<<<<< HEAD
  twimlSayThenGather: jest.fn(msg => `<Response><Say>${msg}</Say><Gather/></Response>`),
  twimlPlayThenGather: jest.fn(url => `<Response><Play>${url}</Play><Gather/></Response>`),
  twimlError: jest.fn(() => '<Response><Say>Error</Say></Response>'),
=======
  twimlSayThenGather:  jest.fn((msg) => `<Response><Say>${msg}</Say><Gather/></Response>`),
  twimlPlayThenGather: jest.fn((url) => `<Response><Play>${url}</Play><Gather/></Response>`),
  twimlError:          jest.fn(() => '<Response><Say>Error</Say></Response>'),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

const { runPipeline } = await import('../../src/features/voice/pipeline.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CTX = { text: 'Créer un rendez-vous', callSid: 'CA-chaos-01', from: '+33611111111' };

const saveAudio = jest.fn(async () => ({ filename: 'response.mp3', ext: 'mp3' }));

function nluOk(overrides = {}) {
  return {
<<<<<<< HEAD
    ok: true,
    intent: 'list_events',
    confidence: 0.9,
    needsClarification: false,
    missing: [],
    subject: '',
    date: '',
    time: '',
    isoDate: null,
    isoTime: null,
    errors: [],
    strategy: 'rule-based',
    ...overrides,
=======
    ok: true, intent: 'list_events', confidence: 0.9,
    needsClarification: false, missing: [],
    subject: '', date: '', time: '', isoDate: null, isoTime: null,
    errors: [], strategy: 'rule-based', ...overrides,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  };
}

function isTwiml(str) {
  return typeof str === 'string' && str.includes('<Response>');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDispatch.mockResolvedValue({ ok: true, message: 'Vous avez 3 rendez-vous.' });
  mockUnderstand.mockResolvedValue(nluOk());
  mockSynthesize.mockResolvedValue({ buffer: Buffer.alloc(100), ext: 'mp3' });
  saveAudio.mockResolvedValue({ filename: 'response.mp3', ext: 'mp3' });
});

// ═════════════════════════════════════════════════════════════════════════════
// Chaos: NLU failures
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: NLU failures → always returns valid TwiML', () => {
  test('NLU throws synchronously → returns error TwiML', async () => {
    mockUnderstand.mockRejectedValueOnce(new Error('NLU internal timeout'));
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });

  test('NLU throws ECONNREFUSED → returns error TwiML', async () => {
    mockUnderstand.mockRejectedValueOnce(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    );
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });

  test('NLU returns needsClarification:true, missing:[] → clarification TwiML', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk({ needsClarification: true, missing: [] }));
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });

  test('NLU returns missing:["date"] → date-question TwiML', async () => {
<<<<<<< HEAD
    mockUnderstand.mockResolvedValueOnce(
      nluOk({
        intent: 'create_event',
        needsClarification: true,
        missing: ['date'],
      })
    );
=======
    mockUnderstand.mockResolvedValueOnce(nluOk({
      intent: 'create_event', needsClarification: true, missing: ['date'],
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });

  test('NLU returns missing:["date","heure"] → combined question', async () => {
<<<<<<< HEAD
    mockUnderstand.mockResolvedValueOnce(
      nluOk({
        intent: 'create_event',
        needsClarification: true,
        missing: ['date', 'heure'],
      })
    );
=======
    mockUnderstand.mockResolvedValueOnce(nluOk({
      intent: 'create_event', needsClarification: true, missing: ['date', 'heure'],
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Chaos: Agent failures
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: Agent failures → pipeline always recovers', () => {
  test('agent throws Error → fallback message in TwiML', async () => {
    mockDispatch.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });

  test('agent throws network error → fallback message', async () => {
    mockDispatch.mockRejectedValueOnce(
      Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })
    );
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });

  test('agent returns ok:false → still returns TwiML with message', async () => {
<<<<<<< HEAD
    mockDispatch.mockResolvedValueOnce({
      ok: false,
      message: 'Opération impossible pour le moment.',
    });
=======
    mockDispatch.mockResolvedValueOnce({ ok: false, message: 'Opération impossible pour le moment.' });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });

  test('agent returns empty message string → does not crash', async () => {
    mockDispatch.mockResolvedValueOnce({ ok: true, message: '' });
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Chaos: TTS / disk failures
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: TTS/audio failures → falls back to <Say>', () => {
  test('synthesize throws → falls back to twimlSayThenGather', async () => {
    mockSynthesize.mockRejectedValueOnce(new Error('TTS provider unavailable'));
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
    expect(result).toContain('<Say>');
  });

  test('saveAudio throws ENOSPC (disk full) → falls back to <Say>', async () => {
    saveAudio.mockRejectedValueOnce(
      Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
    );
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
    expect(result).toContain('<Say>');
  });

  test('saveAudio throws EPERM (permission error) → falls back to <Say>', async () => {
    saveAudio.mockRejectedValueOnce(
      Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
    );
    const result = await runPipeline(CTX, saveAudio);
    expect(isTwiml(result)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Chaos: intent-specific missing-question paths
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: all intent clarification paths produce valid TwiML', () => {
  const cancelMissing = [{ intent: 'cancel_event', missing: ['date'] }];
  const updateMissing = [{ intent: 'update_event', missing: ['date'] }];
  const unknownMissing = [{ intent: 'create_event', missing: ['subject'] }];

  test.each([...cancelMissing, ...updateMissing, ...unknownMissing])(
<<<<<<< HEAD
    'intent=%s missing=[%s] → valid TwiML',
    async ({ intent, missing }) => {
=======
    'intent=%s missing=[%s] → valid TwiML', async ({ intent, missing }) => {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      mockUnderstand.mockResolvedValueOnce(nluOk({ intent, missing, needsClarification: true }));
      const result = await runPipeline(CTX, saveAudio);
      expect(isTwiml(result)).toBe(true);
    }
  );
});
