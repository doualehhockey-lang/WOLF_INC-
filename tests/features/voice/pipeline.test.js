// tests/features/voice/pipeline.test.js
// End-to-end voice pipeline: withTimeout guard, NLU failure, clarification,
// missing-field questions, happy-path dispatch, TTS→<Say> fallback,
// and _buildMissingQuestion text variants.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({
<<<<<<< HEAD
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
=======
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  }),
}));

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
<<<<<<< HEAD
    BASE_URL: 'http://localhost:3000',
=======
    BASE_URL:  'http://localhost:3000',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    AUDIO_DIR: '/tmp/audio',
  },
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockTimer = jest.fn();
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  pipelineLatency: { startTimer: jest.fn(() => mockTimer) },
<<<<<<< HEAD
  errorCounter: { inc: jest.fn() },
  activeSessions: { set: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
=======
  errorCounter:    { inc: jest.fn() },
  activeSessions:  { set: jest.fn() },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Mock NLU ─────────────────────────────────────────────────────────────────
const mockUnderstand = jest.fn();
jest.unstable_mockModule('../../../src/features/nlu/nlu.service.js', () => ({
  understand: mockUnderstand,
}));

// ── Mock Agent ────────────────────────────────────────────────────────────────
const mockDispatch = jest.fn();
jest.unstable_mockModule('../../../src/features/agent/agent.service.js', () => ({
  dispatch: mockDispatch,
}));

// ── Mock TTS ─────────────────────────────────────────────────────────────────
const mockSynthesize = jest.fn();
jest.unstable_mockModule('../../../src/features/tts/tts.service.js', () => ({
  synthesize: mockSynthesize,
}));

<<<<<<< HEAD
// ── Mock conversation service — throws so structured fallback is tested ──────
const mockConverse = jest.fn(async () => {
  throw new Error('converse-disabled-in-test');
});
jest.unstable_mockModule('../../../src/features/voice/conversation.service.js', () => ({
  converse: mockConverse,
}));

// ── Mock Memory ───────────────────────────────────────────────────────────────
const mockAddUserTurn = jest.fn(async () => {});
const mockAddAgentTurn = jest.fn(async () => {});
const mockGetSession = jest.fn(async () => ({ turns: [] }));
const mockMemStats = jest.fn(() => ({ activeSessions: 1 }));
jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  addUserTurn: mockAddUserTurn,
  addAgentTurn: mockAddAgentTurn,
  getSession: mockGetSession,
  getStats: mockMemStats,
=======
// ── Mock Memory ───────────────────────────────────────────────────────────────
const mockAddUserTurn  = jest.fn(async () => {});
const mockAddAgentTurn = jest.fn(async () => {});
const mockMemStats     = jest.fn(() => ({ activeSessions: 1 }));
jest.unstable_mockModule('../../../src/features/memory/memory.service.js', () => ({
  addUserTurn:  mockAddUserTurn,
  addAgentTurn: mockAddAgentTurn,
  getStats:     mockMemStats,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Mock lang ─────────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/features/lang/lang.service.js', () => ({
<<<<<<< HEAD
  detectLang: jest.fn(() => 'fr'),
=======
  detectLang:   jest.fn(() => 'fr'),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  twilioLocale: jest.fn(() => 'fr-FR'),
}));

// ── Mock TwiML builder ────────────────────────────────────────────────────────
<<<<<<< HEAD
const mockSayThenGather = jest.fn(msg => `<Say>${msg}</Say>`);
const mockPlayThenGather = jest.fn(url => `<Play>${url}</Play>`);
jest.unstable_mockModule('../../../src/features/voice/twiml.builder.js', () => ({
  twimlSayThenGather: mockSayThenGather,
  twimlPlayThenGather: mockPlayThenGather,
  twimlError: jest.fn(() => '<Error/>'),
=======
const mockSayThenGather  = jest.fn((msg) => `<Say>${msg}</Say>`);
const mockPlayThenGather = jest.fn((url) => `<Play>${url}</Play>`);
jest.unstable_mockModule('../../../src/features/voice/twiml.builder.js', () => ({
  twimlSayThenGather:  mockSayThenGather,
  twimlPlayThenGather: mockPlayThenGather,
  twimlError:          jest.fn(() => '<Error/>'),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Mock audio utils (saveAudio) ──────────────────────────────────────────────
// saveAudio is passed as a parameter to runPipeline, not imported — so no mock needed.

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { runPipeline, withTimeout } = await import('../../../src/features/voice/pipeline.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────
const CTX = { text: 'Bonjour', callSid: 'CA123', from: '+33612345678' };
const GATHER_URL = 'http://localhost:3000/twilio/gather';

/** Stub saveAudio that always succeeds. */
const saveAudio = jest.fn(async () => ({ filename: 'audio-test.wav' }));

/** A baseline NLU success result with no missing fields. */
function nluOk(overrides = {}) {
  return {
<<<<<<< HEAD
    ok: true,
    intent: 'list_events',
    confidence: 0.9,
    subject: '',
    isoDate: null,
    isoTime: null,
    needsClarification: false,
    missing: [],
    errors: [],
    strategy: 'mock',
=======
    ok:                 true,
    intent:             'list_events',
    confidence:         0.9,
    subject:            '',
    isoDate:            null,
    isoTime:            null,
    needsClarification: false,
    missing:            [],
    errors:             [],
    strategy:           'mock',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTimer.mockReset();
  mockUnderstand.mockReset();
  mockDispatch.mockReset();
  mockSynthesize.mockReset();
  mockAddUserTurn.mockResolvedValue(undefined);
  mockAddAgentTurn.mockResolvedValue(undefined);
  saveAudio.mockResolvedValue({ filename: 'audio-test.wav' });
<<<<<<< HEAD
  mockSynthesize.mockResolvedValue({
    buffer: Buffer.alloc(10),
    ext: '.wav',
    mimeType: 'audio/wav',
    fallback: false,
  });
=======
  mockSynthesize.mockResolvedValue({ buffer: Buffer.alloc(10), ext: '.wav', mimeType: 'audio/wav', fallback: false });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. withTimeout — hard deadline guard
// ═════════════════════════════════════════════════════════════════════════════

describe('withTimeout', () => {
  test('resolves with fn() result when fn completes quickly', async () => {
    const fn = () => Promise.resolve('<Result/>');
    const result = await withTimeout(fn, GATHER_URL);
    expect(result).toBe('<Result/>');
  });

  test('resolves to timeout TwiML when fn exceeds PIPELINE_TIMEOUT', async () => {
    jest.useFakeTimers();
    // fn that never resolves (hangs indefinitely)
    const fn = () => new Promise(() => {});
    const racePromise = withTimeout(fn, GATHER_URL, 'fr-FR');

    // Advance past the 12s pipeline timeout
    jest.advanceTimersByTime(12_001);
    const result = await racePromise;

    expect(mockSayThenGather).toHaveBeenCalledWith(
<<<<<<< HEAD
      expect.stringContaining('instant'),
      GATHER_URL,
      expect.objectContaining({ locale: 'fr-FR' })
=======
      expect.stringContaining('patienter'),
      GATHER_URL,
      expect.objectContaining({ locale: 'fr-FR' }),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );
    expect(typeof result).toBe('string');
    jest.useRealTimers();
  });

  test('fn result wins when it completes before timeout fires', async () => {
    jest.useFakeTimers();
    const fn = () => Promise.resolve('<FastResult/>');
    const result = await withTimeout(fn, GATHER_URL);
    expect(result).toBe('<FastResult/>');
    jest.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. runPipeline — NLU failure
// ═════════════════════════════════════════════════════════════════════════════

describe('runPipeline — NLU failure', () => {
  test('returns error TwiML when understand() throws', async () => {
    mockUnderstand.mockRejectedValueOnce(new Error('Claude API timeout'));
    const result = await runPipeline(CTX, saveAudio);
<<<<<<< HEAD
    expect(result).toContain('problème');
=======
    expect(result).toContain("indisponible");
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('increments errorCounter when NLU fails', async () => {
    mockUnderstand.mockRejectedValueOnce(new Error('fail'));
    await runPipeline(CTX, saveAudio);
    const { errorCounter } = await import('../../../src/core/metrics.js');
    expect(errorCounter.inc).toHaveBeenCalledWith(
<<<<<<< HEAD
      expect.objectContaining({ service: 'pipeline', errorType: 'nlu_error' })
=======
      expect.objectContaining({ service: 'pipeline', errorType: 'nlu_error' }),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );
  });

  test('records timer with success:false when NLU fails', async () => {
    mockUnderstand.mockRejectedValueOnce(new Error('fail'));
    await runPipeline(CTX, saveAudio);
    expect(mockTimer).toHaveBeenCalledWith({ intent: 'nlu_error', success: 'false' });
  });

  test('always adds user turn before NLU is called', async () => {
    mockUnderstand.mockRejectedValueOnce(new Error('fail'));
    await runPipeline(CTX, saveAudio);
    expect(mockAddUserTurn).toHaveBeenCalledWith(CTX.callSid, CTX.text);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. runPipeline — clarification needed (no missing fields list)
// ═════════════════════════════════════════════════════════════════════════════

describe('runPipeline — clarification (needsClarification=true, missing=[])', () => {
  test('returns clarification TwiML without dispatching agent', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk({ needsClarification: true, missing: [] }));
    await runPipeline(CTX, saveAudio);
    expect(mockDispatch).not.toHaveBeenCalled();
    // TTS succeeds (mocked) so _sayOrPlay produces a Play response
    expect(mockPlayThenGather).toHaveBeenCalled();
  });

  test('clarification message explains available actions', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk({ needsClarification: true, missing: [] }));
    await runPipeline(CTX, saveAudio);
    // The clarification text is passed to synthesize, not directly to twimlSayThenGather
    const [text] = mockSynthesize.mock.calls[0];
<<<<<<< HEAD
    expect(text).toMatch(/prendre|annuler|modifier|vérifier/i);
=======
    expect(text).toMatch(/créer|annuler|modifier|consulter/i);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('adds agent turn for clarification message', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk({ needsClarification: true, missing: [] }));
    await runPipeline(CTX, saveAudio);
    expect(mockAddAgentTurn).toHaveBeenCalledWith(CTX.callSid, expect.any(String));
  });

  test('records timer with intent "clarification" and success "true"', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk({ needsClarification: true, missing: [] }));
    await runPipeline(CTX, saveAudio);
    expect(mockTimer).toHaveBeenCalledWith({ intent: 'clarification', success: 'true' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. runPipeline — missing fields (ask clarification question)
// ═════════════════════════════════════════════════════════════════════════════

describe('runPipeline — missing fields', () => {
  test('asks for date when create_event is missing date', async () => {
<<<<<<< HEAD
    mockUnderstand.mockResolvedValueOnce(
      nluOk({
        intent: 'create_event',
        missing: ['date'],
        needsClarification: true,
      })
    );
=======
    mockUnderstand.mockResolvedValueOnce(nluOk({
      intent: 'create_event', missing: ['date'], needsClarification: true,
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await runPipeline(CTX, saveAudio);
    const [msg] = mockSayThenGather.mock.calls[0] ?? [];
    expect(msg ?? mockAddAgentTurn.mock.calls[0]?.[1]).toMatch(/jour/i);
  });

  test('asks for time when create_event is missing heure', async () => {
<<<<<<< HEAD
    mockUnderstand.mockResolvedValueOnce(
      nluOk({
        intent: 'create_event',
        missing: ['heure'],
        needsClarification: true,
      })
    );
=======
    mockUnderstand.mockResolvedValueOnce(nluOk({
      intent: 'create_event', missing: ['heure'], needsClarification: true,
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await runPipeline(CTX, saveAudio);
    const agentMsg = mockAddAgentTurn.mock.calls[0]?.[1] ?? '';
    expect(agentMsg).toMatch(/heure/i);
  });

  test('asks for both date and time when both missing', async () => {
<<<<<<< HEAD
    mockUnderstand.mockResolvedValueOnce(
      nluOk({
        intent: 'create_event',
        missing: ['date', 'heure'],
        needsClarification: true,
      })
    );
=======
    mockUnderstand.mockResolvedValueOnce(nluOk({
      intent: 'create_event', missing: ['date', 'heure'], needsClarification: true,
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await runPipeline(CTX, saveAudio);
    const agentMsg = mockAddAgentTurn.mock.calls[0]?.[1] ?? '';
    expect(agentMsg).toMatch(/jour|heure/i);
  });

  test('asks for date on cancel_event missing date', async () => {
<<<<<<< HEAD
    mockUnderstand.mockResolvedValueOnce(
      nluOk({
        intent: 'cancel_event',
        missing: ['date'],
        needsClarification: true,
      })
    );
=======
    mockUnderstand.mockResolvedValueOnce(nluOk({
      intent: 'cancel_event', missing: ['date'], needsClarification: true,
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await runPipeline(CTX, saveAudio);
    const agentMsg = mockAddAgentTurn.mock.calls[0]?.[1] ?? '';
    expect(agentMsg).toMatch(/annuler/i);
  });

  test('asks for date on update_event missing date', async () => {
<<<<<<< HEAD
    mockUnderstand.mockResolvedValueOnce(
      nluOk({
        intent: 'update_event',
        missing: ['date'],
        needsClarification: true,
      })
    );
=======
    mockUnderstand.mockResolvedValueOnce(nluOk({
      intent: 'update_event', missing: ['date'], needsClarification: true,
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await runPipeline(CTX, saveAudio);
    const agentMsg = mockAddAgentTurn.mock.calls[0]?.[1] ?? '';
    expect(agentMsg).toMatch(/modifier/i);
  });

  test('does NOT dispatch agent when fields are missing', async () => {
<<<<<<< HEAD
    mockUnderstand.mockResolvedValueOnce(
      nluOk({
        intent: 'create_event',
        missing: ['date'],
        needsClarification: true,
      })
    );
=======
    mockUnderstand.mockResolvedValueOnce(nluOk({
      intent: 'create_event', missing: ['date'], needsClarification: true,
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await runPipeline(CTX, saveAudio);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. runPipeline — happy path (dispatch + TTS + Play)
// ═════════════════════════════════════════════════════════════════════════════

describe('runPipeline — happy path', () => {
  test('dispatches nluResult with userKey derived from from field', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk());
    mockDispatch.mockResolvedValueOnce({ ok: true, message: 'Vos rendez-vous: aucun.' });
    await runPipeline(CTX, saveAudio);
    expect(mockDispatch).toHaveBeenCalledWith(expect.anything(), CTX.from);
  });

  test('uses callSid as userKey when from is "unknown"', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk());
    mockDispatch.mockResolvedValueOnce({ ok: true, message: 'OK' });
    await runPipeline({ ...CTX, from: 'unknown' }, saveAudio);
    expect(mockDispatch).toHaveBeenCalledWith(expect.anything(), CTX.callSid);
  });

  test('returns <Play> TwiML when TTS and saveAudio succeed', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk());
    mockDispatch.mockResolvedValueOnce({ ok: true, message: 'Pas de RDV.' });
<<<<<<< HEAD
    mockSynthesize.mockResolvedValueOnce({
      buffer: Buffer.alloc(10),
      ext: '.wav',
      mimeType: 'audio/wav',
      fallback: false,
    });
=======
    mockSynthesize.mockResolvedValueOnce({ buffer: Buffer.alloc(10), ext: '.wav', mimeType: 'audio/wav', fallback: false });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    saveAudio.mockResolvedValueOnce({ filename: 'reply.wav' });
    const result = await runPipeline(CTX, saveAudio);
    expect(result).toContain('reply.wav');
    expect(mockPlayThenGather).toHaveBeenCalled();
  });

  test('records timer with intent and success:true on happy path', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk({ intent: 'list_events' }));
    mockDispatch.mockResolvedValueOnce({ ok: true, message: 'List.' });
    await runPipeline(CTX, saveAudio);
    expect(mockTimer).toHaveBeenCalledWith({ intent: 'list_events', success: 'true' });
  });

  test('adds agent turn with the response message', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk());
    mockDispatch.mockResolvedValueOnce({ ok: true, message: 'Réponse agent.' });
    await runPipeline(CTX, saveAudio);
    expect(mockAddAgentTurn).toHaveBeenCalledWith(
      CTX.callSid,
      expect.stringContaining('Réponse'),
<<<<<<< HEAD
      expect.anything()
=======
      expect.anything(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. runPipeline — TTS failure → <Say> fallback
// ═════════════════════════════════════════════════════════════════════════════

describe('runPipeline — TTS or saveAudio failure → <Say> fallback', () => {
  test('falls back to <Say> when synthesize() throws', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk());
    mockDispatch.mockResolvedValueOnce({ ok: true, message: 'TTS fail test.' });
    mockSynthesize.mockRejectedValueOnce(new Error('TTS provider down'));
    const result = await runPipeline(CTX, saveAudio);
    expect(mockSayThenGather).toHaveBeenCalled();
    expect(result).toContain('TTS fail test');
  });

  test('falls back to <Say> when saveAudio() throws', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk());
    mockDispatch.mockResolvedValueOnce({ ok: true, message: 'Save fail.' });
    saveAudio.mockRejectedValueOnce(new Error('Disk full'));
    const result = await runPipeline(CTX, saveAudio);
    expect(mockSayThenGather).toHaveBeenCalled();
    expect(result).toContain('Save fail');
  });

  test('increments errorCounter with service:tts on TTS failure', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk());
    mockDispatch.mockResolvedValueOnce({ ok: true, message: 'Err.' });
    mockSynthesize.mockRejectedValueOnce(new Error('Timeout'));
    await runPipeline(CTX, saveAudio);
    const { errorCounter } = await import('../../../src/core/metrics.js');
<<<<<<< HEAD
    expect(errorCounter.inc).toHaveBeenCalledWith(expect.objectContaining({ service: 'tts' }));
=======
    expect(errorCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'tts' }),
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. runPipeline — agent dispatch failure
// ═════════════════════════════════════════════════════════════════════════════

describe('runPipeline — agent dispatch failure', () => {
  test('returns a generic error message and does not throw', async () => {
    mockUnderstand.mockResolvedValueOnce(nluOk());
    mockDispatch.mockRejectedValueOnce(new Error('DB unavailable'));
    const result = await runPipeline(CTX, saveAudio);
    expect(typeof result).toBe('string');
  });

<<<<<<< HEAD
  test('uses fallback message in French when agent dispatch fails', async () => {
=======
  test('uses fallback message "Une erreur interne est survenue"', async () => {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    mockUnderstand.mockResolvedValueOnce(nluOk());
    mockDispatch.mockRejectedValueOnce(new Error('crash'));
    await runPipeline(CTX, saveAudio);
    // The fallback message is passed to TTS or Say — check agent turn content
    const [, msg] = mockAddAgentTurn.mock.calls[0] ?? [null, ''];
<<<<<<< HEAD
    expect(msg).toMatch(/problème est survenu/i);
=======
    expect(msg).toMatch(/erreur interne/i);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// _buildMissingQuestion — line 136 FALSE branch (create_event, no date, no heure)
// ═════════════════════════════════════════════════════════════════════════════

describe('_buildMissingQuestion — line 136 FALSE branch (create_event, unknown missing field)', () => {
  test('falls through to default question when create_event missing an unknown field', async () => {
    // Covers line 136 FALSE: missing doesn't include 'heure' (nor 'date')
    // For create_event, after failing both date and heure checks, falls through to default
<<<<<<< HEAD
    mockUnderstand.mockResolvedValueOnce(
      nluOk({
        intent: 'create_event',
        missing: ['subject'], // neither 'date' nor 'heure'
        needsClarification: true,
      })
    );
=======
    mockUnderstand.mockResolvedValueOnce(nluOk({
      intent:             'create_event',
      missing:            ['subject'],  // neither 'date' nor 'heure'
      needsClarification: true,
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const result = await runPipeline(CTX, saveAudio);
    // Should not throw — _buildMissingQuestion returns default question
    expect(typeof result).toBe('string');
    const agentMsg = mockAddAgentTurn.mock.calls[0]?.[1] ?? '';
    expect(agentMsg).toMatch(/préciser/i);
  });
});
