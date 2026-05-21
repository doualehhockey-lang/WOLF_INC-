// @ts-nocheck
// tests/services/agent.test.js
//
// Tests for src/services/agent.js — Wolf Engine ML pipeline orchestrator.
//
// Strategy: jest.unstable_mockModule for all 4 client modules + metrics + logger.
// _makeAgent(deps) is used with explicit dep injection so tests are fully isolated.

import { jest } from '@jest/globals';

// ── Mock all dependencies ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordAgentRequest:     jest.fn(),
  recordAgentLatency:     jest.fn(),
  recordAgentStageFailure: jest.fn(),
  recordPipelineSuccess:  jest.fn(),
  // provider-level helpers (not used by agent.js directly, but metrics module exports them)
  recordRequest:    jest.fn(),
  recordFailure:    jest.fn(),
  recordLatency:    jest.fn(),
  setCircuitState:  jest.fn(),
}));

// circuitBreaker errors ARE real — we need the real class instances for instanceof checks
// but we don't want the module to do anything heavy, so just re-export the real module.
// No mock needed here — the real circuitBreaker.js only exports class definitions.

// ── Import after mocks ────────────────────────────────────────────────────────

const {
  recordAgentRequest,
  recordAgentLatency,
  recordAgentStageFailure,
  recordPipelineSuccess,
} = await import('../../src/services/metrics.js');

const { _makeAgent }       = await import('../../src/services/agent.js');
const { CircuitOpenError, TimeoutError } = await import('../../src/services/circuitBreaker.js');

// ── Test helpers ──────────────────────────────────────────────────────────────

const DUMMY_WAV = Buffer.from('RIFF');

const MOCK_ANALYSIS = {
  intent:     'create_event',
  subject:    'Réunion équipe',
  date:       'lundi',
  time:       '14h30',
  confidence: 0.95,
  errors:     [],
  strategy:   'claude',
};

const MOCK_ENRICHED = {
  intent:     'create_event',
  subject:    'Réunion équipe',
  date:       'lundi',
  time:       '14h30',
  confidence: 0.95,
  errors:     [],
  strategy:   'ollama',
};

const MOCK_AUDIO = { buffer: Buffer.from('audio'), ext: '.mp3', mimeType: 'audio/mpeg' };

/** Build a fully-wired agent with controllable fakes. */
function makeAgent(overrides = {}) {
  let fakeNow = 1_000_000;

  const deps = {
    transcribeWav: jest.fn().mockResolvedValue('Crée une réunion lundi à 14h30'),
    claudeAnalyze: jest.fn().mockResolvedValue(MOCK_ANALYSIS),
    ollamaAnalyze: jest.fn().mockResolvedValue(MOCK_ENRICHED),
    synthesize:    jest.fn().mockResolvedValue(MOCK_AUDIO),
    now: () => fakeNow,
    ...overrides,
  };

  const { process } = _makeAgent(deps);
  return {
    process,
    deps,
    advance: (ms) => { fakeNow += ms; },
  };
}

// ── Reset mocks between tests ─────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Happy-path — full pipeline success
// ─────────────────────────────────────────────────────────────────────────────

describe('full pipeline success', () => {
  test('returns ok:true with all fields populated', async () => {
    const { process, deps, advance } = makeAgent();

    // Simulate 500 ms of pipeline time
    const origTranscribe = deps.transcribeWav;
    deps.transcribeWav = jest.fn().mockImplementation(async (...a) => {
      advance(200);
      return origTranscribe(...a);
    });

    const result = await process(DUMMY_WAV, { requestId: 'req-1' });

    expect(result.ok).toBe(true);
    expect(result.requestId).toBe('req-1');
    expect(result.transcription).toBe('Crée une réunion lundi à 14h30');
    expect(result.analysis).toEqual(MOCK_ANALYSIS);
    expect(result.enriched).toEqual(MOCK_ENRICHED);
    expect(result.audio).toBe(MOCK_AUDIO);
    expect(typeof result.responseText).toBe('string');
    expect(result.responseText.length).toBeGreaterThan(0);
    expect(typeof result.latency).toBe('number');
  });

  test('calls all 4 stages in order', async () => {
    const order = [];
    const { process } = makeAgent({
      transcribeWav: jest.fn().mockImplementation(async () => { order.push('whisper'); return 'text'; }),
      claudeAnalyze: jest.fn().mockImplementation(async () => { order.push('claude'); return MOCK_ANALYSIS; }),
      ollamaAnalyze: jest.fn().mockImplementation(async () => { order.push('ollama'); return MOCK_ENRICHED; }),
      synthesize:    jest.fn().mockImplementation(async () => { order.push('tts'); return MOCK_AUDIO; }),
    });

    await process(DUMMY_WAV, { requestId: 'req-order' });
    expect(order).toEqual(['whisper', 'claude', 'ollama', 'tts']);
  });

  test('records success metrics', async () => {
    const { process } = makeAgent();
    await process(DUMMY_WAV, { requestId: 'req-metrics' });

    expect(recordPipelineSuccess).toHaveBeenCalledTimes(1);
    expect(recordAgentRequest).toHaveBeenCalledWith('success');
    expect(recordAgentLatency).toHaveBeenCalledWith(expect.any(Number));
    expect(recordAgentStageFailure).not.toHaveBeenCalled();
  });

  test('propagates requestId to every stage', async () => {
    const { process, deps } = makeAgent();
    await process(DUMMY_WAV, { requestId: 'req-propagate' });

    expect(deps.transcribeWav).toHaveBeenCalledWith(DUMMY_WAV, expect.objectContaining({ requestId: 'req-propagate' }));
    expect(deps.claudeAnalyze).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ requestId: 'req-propagate' }));
    expect(deps.ollamaAnalyze).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ requestId: 'req-propagate' }));
    expect(deps.synthesize).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ requestId: 'req-propagate' }));
  });

  test('auto-generates requestId when not provided', async () => {
    const { process } = makeAgent();
    const result = await process(DUMMY_WAV);

    expect(result.ok).toBe(true);
    expect(typeof result.requestId).toBe('string');
    expect(result.requestId.length).toBeGreaterThan(0);
  });

  test('skips Whisper when opts.text is provided', async () => {
    const { process, deps } = makeAgent();
    const result = await process(null, { requestId: 'req-text', text: 'direct text input' });

    expect(result.ok).toBe(true);
    expect(result.transcription).toBe('direct text input');
    expect(deps.transcribeWav).not.toHaveBeenCalled();
    expect(deps.claudeAnalyze).toHaveBeenCalledWith('direct text input', expect.any(Object));
  });

  test('passes locale to TTS synthesize', async () => {
    const { process, deps } = makeAgent();
    await process(DUMMY_WAV, { requestId: 'req-locale', locale: 'en-US' });

    expect(deps.synthesize).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ locale: 'en-US' }));
  });

  test('defaults locale to fr-FR', async () => {
    const { process, deps } = makeAgent();
    await process(DUMMY_WAV, { requestId: 'req-locale-default' });

    expect(deps.synthesize).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ locale: 'fr-FR' }));
  });

  test('passes timeoutMs to every stage', async () => {
    const { process, deps } = makeAgent();
    await process(DUMMY_WAV, { requestId: 'req-timeout', timeoutMs: 9_999 });

    expect(deps.transcribeWav).toHaveBeenCalledWith(DUMMY_WAV, expect.objectContaining({ timeoutMs: 9_999 }));
    expect(deps.claudeAnalyze).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ timeoutMs: 9_999 }));
    expect(deps.ollamaAnalyze).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ timeoutMs: 9_999 }));
    expect(deps.synthesize).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ timeoutMs: 9_999 }));
  });

  test('latency reflects elapsed time', async () => {
    let fakeNow = 5_000_000;
    const deps = {
      transcribeWav: jest.fn().mockImplementation(async () => { fakeNow += 100; return 'text'; }),
      claudeAnalyze: jest.fn().mockImplementation(async () => { fakeNow += 200; return MOCK_ANALYSIS; }),
      ollamaAnalyze: jest.fn().mockImplementation(async () => { fakeNow += 50;  return MOCK_ENRICHED; }),
      synthesize:    jest.fn().mockImplementation(async () => { fakeNow += 150; return MOCK_AUDIO; }),
      now: () => fakeNow,
    };
    const { process } = _makeAgent(deps);
    const result = await process(DUMMY_WAV, { requestId: 'req-latency' });

    expect(result.latency).toBe(500); // 100+200+50+150
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. _composeResponse — intent routing
// ─────────────────────────────────────────────────────────────────────────────

describe('responseText composition', () => {
  async function textFor(intent, subject = 'S', date = 'lundi', time = '9h') {
    const { process } = makeAgent({
      claudeAnalyze: jest.fn().mockResolvedValue({ intent, subject, date, time, confidence: 0.9, errors: [], strategy: 'claude' }),
    });
    const result = await process(DUMMY_WAV, { requestId: 'req-text-' + intent });
    return result.responseText;
  }

  test('create_event includes subject, date, time', async () => {
    const text = await textFor('create_event', 'Réunion', 'mardi', '10h00');
    expect(text).toContain('Réunion');
    expect(text).toContain('mardi');
    expect(text).toContain('10h00');
  });

  test('cancel_event includes subject', async () => {
    const text = await textFor('cancel_event', 'Dentiste');
    expect(text).toContain('Dentiste');
  });

  test('update_event includes subject', async () => {
    const text = await textFor('update_event', 'Formation');
    expect(text).toContain('Formation');
  });

  test('list_events returns non-empty string', async () => {
    const text = await textFor('list_events');
    expect(text.length).toBeGreaterThan(0);
  });

  test('unknown intent returns fallback message', async () => {
    const text = await textFor('unknown');
    expect(text.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Whisper failure
// ─────────────────────────────────────────────────────────────────────────────

describe('Whisper stage failure', () => {
  test('generic error → ok:false, stage:whisper', async () => {
    const { process } = makeAgent({
      transcribeWav: jest.fn().mockRejectedValue(new Error('network error')),
    });

    const result = await process(DUMMY_WAV, { requestId: 'req-wfail' });

    expect(result.ok).toBe(false);
    expect(result.stage).toBe('whisper');
    expect(result.error).toBe('network error');
    expect(result.requestId).toBe('req-wfail');
  });

  test('generic error records stage failure with reason error', async () => {
    const { process } = makeAgent({
      transcribeWav: jest.fn().mockRejectedValue(new Error('oops')),
    });
    await process(DUMMY_WAV, { requestId: 'req-wfail-metric' });

    expect(recordAgentStageFailure).toHaveBeenCalledWith('whisper', 'error');
    expect(recordAgentRequest).toHaveBeenCalledWith('error');
    expect(recordAgentLatency).toHaveBeenCalledWith(expect.any(Number));
    expect(recordPipelineSuccess).not.toHaveBeenCalled();
  });

  test('CircuitOpenError → reason circuit_open', async () => {
    const { process } = makeAgent({
      transcribeWav: jest.fn().mockRejectedValue(new CircuitOpenError('whisper')),
    });
    await process(DUMMY_WAV, { requestId: 'req-wco' });

    expect(recordAgentStageFailure).toHaveBeenCalledWith('whisper', 'circuit_open');
  });

  test('TimeoutError → reason timeout', async () => {
    const { process } = makeAgent({
      transcribeWav: jest.fn().mockRejectedValue(new TimeoutError('whisper', 5000)),
    });
    await process(DUMMY_WAV, { requestId: 'req-wto' });

    expect(recordAgentStageFailure).toHaveBeenCalledWith('whisper', 'timeout');
  });

  test('downstream stages are NOT called', async () => {
    const { process, deps } = makeAgent({
      transcribeWav: jest.fn().mockRejectedValue(new Error('fail')),
    });
    await process(DUMMY_WAV, { requestId: 'req-wskip' });

    expect(deps.claudeAnalyze).not.toHaveBeenCalled();
    expect(deps.ollamaAnalyze).not.toHaveBeenCalled();
    expect(deps.synthesize).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Claude failure
// ─────────────────────────────────────────────────────────────────────────────

describe('Claude stage failure', () => {
  test('generic error → ok:false, stage:claude', async () => {
    const { process } = makeAgent({
      claudeAnalyze: jest.fn().mockRejectedValue(new Error('claude down')),
    });
    const result = await process(DUMMY_WAV, { requestId: 'req-cfail' });

    expect(result.ok).toBe(false);
    expect(result.stage).toBe('claude');
    expect(result.error).toBe('claude down');
    expect(result.requestId).toBe('req-cfail');
  });

  test('records stage failure with correct reason', async () => {
    const { process } = makeAgent({
      claudeAnalyze: jest.fn().mockRejectedValue(new CircuitOpenError('claude')),
    });
    await process(DUMMY_WAV, { requestId: 'req-cco' });

    expect(recordAgentStageFailure).toHaveBeenCalledWith('claude', 'circuit_open');
    expect(recordAgentRequest).toHaveBeenCalledWith('error');
    expect(recordPipelineSuccess).not.toHaveBeenCalled();
  });

  test('TTS is NOT called after Claude failure', async () => {
    const { process, deps } = makeAgent({
      claudeAnalyze: jest.fn().mockRejectedValue(new Error('fail')),
    });
    await process(DUMMY_WAV, { requestId: 'req-cskip' });

    expect(deps.synthesize).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Ollama failure / fallback (non-blocking)
// ─────────────────────────────────────────────────────────────────────────────

describe('Ollama stage — non-blocking fallback', () => {
  test('ollama-error strategy → pipeline continues, ok:true', async () => {
    const ollamaErrorResult = { intent: 'unknown', subject: '', date: '', time: '', confidence: 0, errors: ['timeout'], strategy: 'ollama-error' };
    const { process } = makeAgent({
      ollamaAnalyze: jest.fn().mockResolvedValue(ollamaErrorResult),
    });
    const result = await process(DUMMY_WAV, { requestId: 'req-ollama-soft' });

    expect(result.ok).toBe(true);
    expect(result.enriched.strategy).toBe('ollama-error');
    expect(result.audio).toBe(MOCK_AUDIO);
  });

  test('ollama-error strategy records stage failure metric', async () => {
    const { process } = makeAgent({
      ollamaAnalyze: jest.fn().mockResolvedValue({ strategy: 'ollama-error', intent: 'unknown', subject: '', date: '', time: '', confidence: 0, errors: [] }),
    });
    await process(DUMMY_WAV, { requestId: 'req-ollama-metric' });

    expect(recordAgentStageFailure).toHaveBeenCalledWith('ollama', 'error');
    // Pipeline still succeeds
    expect(recordPipelineSuccess).toHaveBeenCalledTimes(1);
    expect(recordAgentRequest).toHaveBeenCalledWith('success');
  });

  test('if ollamaAnalyze throws unexpectedly → pipeline continues with synthetic fallback', async () => {
    const { process } = makeAgent({
      ollamaAnalyze: jest.fn().mockRejectedValue(new Error('unexpected throw')),
    });
    const result = await process(DUMMY_WAV, { requestId: 'req-ollama-throw' });

    expect(result.ok).toBe(true);
    expect(result.enriched.strategy).toBe('ollama-error');
    expect(result.enriched.errors).toContain('unexpected throw');
  });

  test('unexpected throw records ollama stage failure', async () => {
    const { process } = makeAgent({
      ollamaAnalyze: jest.fn().mockRejectedValue(new CircuitOpenError('ollama')),
    });
    await process(DUMMY_WAV, { requestId: 'req-ollama-co' });

    expect(recordAgentStageFailure).toHaveBeenCalledWith('ollama', 'circuit_open');
    expect(recordPipelineSuccess).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. TTS failure
// ─────────────────────────────────────────────────────────────────────────────

describe('TTS stage failure', () => {
  test('generic error → ok:false, stage:tts', async () => {
    const { process } = makeAgent({
      synthesize: jest.fn().mockRejectedValue(new Error('tts error')),
    });
    const result = await process(DUMMY_WAV, { requestId: 'req-tts-fail' });

    expect(result.ok).toBe(false);
    expect(result.stage).toBe('tts');
    expect(result.error).toBe('tts error');
    expect(result.requestId).toBe('req-tts-fail');
  });

  test('records stage failure with correct reason', async () => {
    const { process } = makeAgent({
      synthesize: jest.fn().mockRejectedValue(new TimeoutError('tts', 15_000)),
    });
    await process(DUMMY_WAV, { requestId: 'req-tts-to' });

    expect(recordAgentStageFailure).toHaveBeenCalledWith('tts', 'timeout');
    expect(recordAgentRequest).toHaveBeenCalledWith('error');
    expect(recordPipelineSuccess).not.toHaveBeenCalled();
  });

  test('CircuitOpenError → reason circuit_open', async () => {
    const { process } = makeAgent({
      synthesize: jest.fn().mockRejectedValue(new CircuitOpenError('tts')),
    });
    await process(DUMMY_WAV, { requestId: 'req-tts-co' });

    expect(recordAgentStageFailure).toHaveBeenCalledWith('tts', 'circuit_open');
  });

  test('Whisper, Claude, Ollama ARE called before TTS failure', async () => {
    const { process, deps } = makeAgent({
      synthesize: jest.fn().mockRejectedValue(new Error('tts down')),
    });
    await process(DUMMY_WAV, { requestId: 'req-tts-upstream' });

    expect(deps.transcribeWav).toHaveBeenCalledTimes(1);
    expect(deps.claudeAnalyze).toHaveBeenCalledTimes(1);
    expect(deps.ollamaAnalyze).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. requestId propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('requestId propagation', () => {
  test('explicit requestId flows into failure result', async () => {
    const { process } = makeAgent({
      transcribeWav: jest.fn().mockRejectedValue(new Error('fail')),
    });
    const result = await process(DUMMY_WAV, { requestId: 'my-custom-id' });
    expect(result.requestId).toBe('my-custom-id');
  });

  test('auto-generated requestId is a non-empty string', async () => {
    const { process } = makeAgent({
      transcribeWav: jest.fn().mockRejectedValue(new Error('fail')),
    });
    const result = await process(DUMMY_WAV);
    expect(typeof result.requestId).toBe('string');
    expect(result.requestId.length).toBeGreaterThan(8);
  });

  test('two invocations without requestId get different ids', async () => {
    const { process } = makeAgent({
      transcribeWav: jest.fn().mockRejectedValue(new Error('fail')),
    });
    const [r1, r2] = await Promise.all([process(DUMMY_WAV), process(DUMMY_WAV)]);
    expect(r1.requestId).not.toBe(r2.requestId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Metrics — detailed correctness
// ─────────────────────────────────────────────────────────────────────────────

describe('metrics correctness', () => {
  test('success path: recordLatency receives positive number', async () => {
    let fakeNow = 0;
    const deps = {
      transcribeWav: jest.fn().mockImplementation(async () => { fakeNow += 100; return 'text'; }),
      claudeAnalyze: jest.fn().mockImplementation(async () => { fakeNow += 200; return MOCK_ANALYSIS; }),
      ollamaAnalyze: jest.fn().mockImplementation(async () => { fakeNow += 50;  return MOCK_ENRICHED; }),
      synthesize:    jest.fn().mockImplementation(async () => { fakeNow += 150; return MOCK_AUDIO; }),
      now: () => fakeNow,
    };
    const { process } = _makeAgent(deps);
    await process(DUMMY_WAV, { requestId: 'req-lat' });

    const latencyArg = recordAgentLatency.mock.calls[0][0];
    expect(latencyArg).toBe(500);
  });

  test('each error path calls recordAgentRequest exactly once', async () => {
    for (const [stage, override] of [
      ['whisper', { transcribeWav: jest.fn().mockRejectedValue(new Error('fail')) }],
      ['claude',  { claudeAnalyze: jest.fn().mockRejectedValue(new Error('fail')) }],
      ['tts',     { synthesize:    jest.fn().mockRejectedValue(new Error('fail')) }],
    ]) {
      jest.clearAllMocks();
      const { process } = makeAgent(override);
      await process(DUMMY_WAV, { requestId: `req-${stage}` });
      expect(recordAgentRequest).toHaveBeenCalledTimes(1);
      expect(recordAgentRequest).toHaveBeenCalledWith('error');
    }
  });

  test('success path does not call recordAgentStageFailure', async () => {
    const { process } = makeAgent();
    await process(DUMMY_WAV, { requestId: 'req-nosf' });
    // Only ollama stage would fire if enriched.strategy === 'ollama-error';
    // here it returns valid enrichment
    expect(recordAgentStageFailure).not.toHaveBeenCalled();
  });

  test('recordPipelineSuccess not called on any stage failure', async () => {
    for (const override of [
      { transcribeWav: jest.fn().mockRejectedValue(new Error('fail')) },
      { claudeAnalyze: jest.fn().mockRejectedValue(new Error('fail')) },
      { synthesize:    jest.fn().mockRejectedValue(new Error('fail')) },
    ]) {
      jest.clearAllMocks();
      const { process } = makeAgent(override);
      await process(DUMMY_WAV, { requestId: 'req-nops' });
      expect(recordPipelineSuccess).not.toHaveBeenCalled();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Multiple concurrent calls
// ─────────────────────────────────────────────────────────────────────────────

describe('concurrent pipeline calls', () => {
  test('two simultaneous success calls return independent results', async () => {
    const { process } = makeAgent({
      claudeAnalyze: jest.fn()
        .mockResolvedValueOnce({ ...MOCK_ANALYSIS, subject: 'First' })
        .mockResolvedValueOnce({ ...MOCK_ANALYSIS, subject: 'Second' }),
    });

    const [r1, r2] = await Promise.all([
      process(DUMMY_WAV, { requestId: 'req-concurrent-1' }),
      process(DUMMY_WAV, { requestId: 'req-concurrent-2' }),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.requestId).toBe('req-concurrent-1');
    expect(r2.requestId).toBe('req-concurrent-2');
  });

  test('one success and one failure are independent', async () => {
    let call = 0;
    const { process } = makeAgent({
      transcribeWav: jest.fn().mockImplementation(async () => {
        call++;
        if (call === 1) throw new Error('first fails');
        return 'ok text';
      }),
    });

    const [r1, r2] = await Promise.all([
      process(DUMMY_WAV, { requestId: 'req-fail' }),
      process(DUMMY_WAV, { requestId: 'req-ok' }),
    ]);

    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('empty wavBuffer (null) with opts.text skips whisper gracefully', async () => {
    const { process, deps } = makeAgent();
    const result = await process(null, { requestId: 'req-null', text: 'hello' });

    expect(result.ok).toBe(true);
    expect(deps.transcribeWav).not.toHaveBeenCalled();
  });

  test('analysis with undefined fields does not crash _composeResponse', async () => {
    const { process } = makeAgent({
      claudeAnalyze: jest.fn().mockResolvedValue({ intent: 'create_event' }),
    });
    const result = await process(DUMMY_WAV, { requestId: 'req-undef' });

    expect(result.ok).toBe(true);
    expect(typeof result.responseText).toBe('string');
  });

  test('analysis null does not crash _composeResponse', async () => {
    const { process } = makeAgent({
      claudeAnalyze: jest.fn().mockResolvedValue(null),
    });
    const result = await process(DUMMY_WAV, { requestId: 'req-null-analysis' });

    expect(result.ok).toBe(true);
    expect(typeof result.responseText).toBe('string');
  });

  test('unknown intent in analysis uses fallback response', async () => {
    const { process } = makeAgent({
      claudeAnalyze: jest.fn().mockResolvedValue({ intent: 'foobar_unknown_intent' }),
    });
    const result = await process(DUMMY_WAV, { requestId: 'req-unknown-intent' });

    expect(result.ok).toBe(true);
    expect(result.responseText.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Default parameters (line 126) — wavBuffer = null default branch
// ─────────────────────────────────────────────────────────────────────────────

describe('process() default parameters (line 126)', () => {
  test('calling process() with no arguments uses wavBuffer=null default', async () => {
    // This covers the TRUE branch of `wavBuffer = null` — the only code path
    // where wavBuffer is not explicitly provided. transcribeWav is called with null.
    const { process, deps } = makeAgent();
    const result = await process();

    expect(result.ok).toBe(true);
    expect(deps.transcribeWav).toHaveBeenCalledWith(null, expect.any(Object));
  });
});
