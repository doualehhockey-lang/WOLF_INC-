// tests/services/observability.test.js
//
// Tests for src/services/observability.js — OpenTelemetry SDK wrapper.
//
// Strategy:
//   - Use _makeObservability(deps) with injected fake constructors to avoid
//     real SDK side-effects (no real HTTP exporters, no global provider mutation).
//   - For span capture, inject an InMemorySpanExporter via opts.spanExporter.
//   - For metric capture, inject a real MeterProvider + InMemoryMetricExporter.
//   - Tests for the no-op path (OTEL_ENABLED=false) verify zero crashes.

import { jest }         from '@jest/globals';
import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { MeterProvider, InMemoryMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

// ── Mock logger so test output is clean ──────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

// ── Mock config — load after mocks ───────────────────────────────────────────

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    OTEL_ENABLED:  false,
    OTEL_ENDPOINT: '',
    NODE_ENV:      'test',
  },
}));

const { _makeObservability, STAGES, SERVICE_NAME, getPipelineInstruments } =
  await import('../../src/services/observability.js');

// ── SDK mock factory ──────────────────────────────────────────────────────────

/**
 * Build a fake NodeSDK constructor that records start/shutdown calls.
 * Returns { FakeNodeSDK, calls } where calls.started / calls.shutdown
 * increment on the respective methods.
 */
function makeFakeSDK() {
  const calls = { started: 0, shutdown: 0, startError: null, shutdownError: null };

  class FakeNodeSDK {
    start() {
      if (calls.startError) throw calls.startError;
      calls.started++;
    }
    async shutdown() {
      if (calls.shutdownError) throw calls.shutdownError;
      calls.shutdown++;
    }
  }

  return { FakeNodeSDK, calls };
}

/** Minimal fake constructor that does nothing. */
const noop = class {};

/** Build _makeObservability deps with a FakeNodeSDK and no-op everything else. */
function makeDeps(overrides = {}) {
  const { FakeNodeSDK, calls } = makeFakeSDK();
  return {
    deps: {
      NodeSDK:                     FakeNodeSDK,
      Resource:                    noop,
      OTLPTraceExporter:           noop,
      OTLPMetricExporter:          noop,
      PeriodicExportingMetricReader: noop,
      BatchSpanProcessor:          noop,
      HttpInstrumentation:         noop,
      ExpressInstrumentation:      noop,
      ...overrides,
    },
    sdkCalls: calls,
  };
}

// ── Reset mocks between tests ─────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. init() — no-op when OTEL_ENABLED=false
// ─────────────────────────────────────────────────────────────────────────────

describe('init() — disabled path (OTEL_ENABLED=false)', () => {
  test('completes without throwing', async () => {
    const { init } = _makeObservability();
    await expect(init()).resolves.toBeUndefined();
  });

  test('does not start NodeSDK when disabled', async () => {
    const { deps, sdkCalls } = makeDeps();
    const { init } = _makeObservability(deps);
    await init(); // OTEL_ENABLED=false, no force
    expect(sdkCalls.started).toBe(0);
  });

  test('calling init() twice is safe (idempotent)', async () => {
    const { init } = _makeObservability();
    await init();
    await init(); // second call is no-op
    // no throw
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. init() — enabled path (opts.force=true)
// ─────────────────────────────────────────────────────────────────────────────

describe('init() — enabled path (opts.force=true)', () => {
  test('starts NodeSDK when force=true', async () => {
    const { deps, sdkCalls } = makeDeps();
    const { init } = _makeObservability(deps);
    await init({ force: true });
    expect(sdkCalls.started).toBe(1);
  });

  test('does not start SDK twice on double-init', async () => {
    const { deps, sdkCalls } = makeDeps();
    const { init } = _makeObservability(deps);
    await init({ force: true });
    await init({ force: true }); // second call is no-op
    expect(sdkCalls.started).toBe(1);
  });

  test('does not crash if SDK.start() throws (degraded mode)', async () => {
    const { deps, sdkCalls } = makeDeps();
    sdkCalls.startError = new Error('SDK init failed');
    const { init } = _makeObservability(deps);
    await expect(init({ force: true })).resolves.toBeUndefined();
  });

  test('uses custom OTLP endpoint when provided', async () => {
    let capturedTraceUrl;
    const FakeOTLPTraceExporter = class {
      constructor(opts) { capturedTraceUrl = opts?.url; }
    };
    const { deps } = makeDeps({ OTLPTraceExporter: FakeOTLPTraceExporter });

    // Also provide a fake BatchSpanProcessor that accepts an exporter
    deps.BatchSpanProcessor = class { constructor() {} };

    const { init } = _makeObservability(deps);
    await init({ force: true, endpoint: 'http://otel-collector:4318' });

    expect(capturedTraceUrl).toBe('http://otel-collector:4318/v1/traces');
  });

  test('no span processor when endpoint is absent', async () => {
    // If endpoint is null and no spanExporter injected, init still succeeds
    const { deps } = makeDeps();
    const { init } = _makeObservability(deps);
    await expect(init({ force: true })).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. shutdown()
// ─────────────────────────────────────────────────────────────────────────────

describe('shutdown()', () => {
  test('no-op when SDK was never started', async () => {
    const { shutdown } = _makeObservability();
    await expect(shutdown()).resolves.toBeUndefined();
  });

  test('calls sdk.shutdown() after successful init', async () => {
    const { deps, sdkCalls } = makeDeps();
    const { init, shutdown } = _makeObservability(deps);
    await init({ force: true });
    await shutdown();
    expect(sdkCalls.shutdown).toBe(1);
  });

  test('does not throw if sdk.shutdown() rejects', async () => {
    const { deps, sdkCalls } = makeDeps();
    sdkCalls.shutdownError = new Error('flush timeout');
    const { init, shutdown } = _makeObservability(deps);
    await init({ force: true });
    await expect(shutdown()).resolves.toBeUndefined();
  });

  test('sdk is reset after shutdown — subsequent init() re-initializes', async () => {
    const { deps, sdkCalls } = makeDeps();
    const { init, shutdown } = _makeObservability(deps);
    await init({ force: true });
    await shutdown();
    await init({ force: true }); // must start again
    expect(sdkCalls.started).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. getTracer() / getMeter()
// ─────────────────────────────────────────────────────────────────────────────

describe('getTracer() and getMeter()', () => {
  test('getTracer() returns an object with startSpan method (no-op tracer)', () => {
    const { getTracer } = _makeObservability();
    const tracer = getTracer();
    expect(typeof tracer.startSpan).toBe('function');
  });

  test('getMeter() returns an object with createCounter / createHistogram', () => {
    const { getMeter } = _makeObservability();
    const meter = getMeter();
    expect(typeof meter.createCounter).toBe('function');
    expect(typeof meter.createHistogram).toBe('function');
  });

  test('getTracer uses injected traceApi', () => {
    const fakeTracer = { startSpan: jest.fn() };
    const fakeTraceApi = { getTracer: jest.fn().mockReturnValue(fakeTracer) };
    const { getTracer } = _makeObservability({ traceApi: fakeTraceApi });

    const result = getTracer('my-service');
    expect(fakeTraceApi.getTracer).toHaveBeenCalledWith('my-service', expect.any(String));
    expect(result).toBe(fakeTracer);
  });

  test('getMeter uses injected metricsApi', () => {
    const fakeMeter = { createCounter: jest.fn(), createHistogram: jest.fn() };
    const fakeMetricsApi = { getMeter: jest.fn().mockReturnValue(fakeMeter) };
    const { getMeter } = _makeObservability({ metricsApi: fakeMetricsApi });

    const result = getMeter('my-service');
    expect(fakeMetricsApi.getMeter).toHaveBeenCalledWith('my-service', expect.any(String));
    expect(result).toBe(fakeMeter);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. withSpan() — span lifecycle and status
// ─────────────────────────────────────────────────────────────────────────────

describe('withSpan()', () => {
  /**
   * Build an obs instance backed by a real NodeTracerProvider + InMemorySpanExporter.
   * We inject a fake traceApi so observability.js uses OUR provider, not the global one.
   * This is the correct approach: NodeSDK.start() mutates the global provider, but since
   * we use FakeNodeSDK (which does nothing), we inject our own.
   */
  function makeTracedObs() {
    const exporter = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);
    const provider = new NodeTracerProvider({ spanProcessors: [processor] });

    // Inject a traceApi that routes through our real provider
    const fakeTraceApi = { getTracer: (name, ver) => provider.getTracer(name, ver) };
    const { deps } = makeDeps();
    const obs = _makeObservability({ ...deps, traceApi: fakeTraceApi });
    return { obs, exporter, provider };
  }

  test('span is created and ended for a successful fn', async () => {
    const { obs, exporter } = makeTracedObs();
    await obs.withSpan('test.span', { 'test.attr': 'value' }, async () => 42);

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
    const span = spans.find(s => s.name === 'test.span');
    expect(span).toBeDefined();
    expect(span.attributes['test.attr']).toBe('value');
  });

  test('span status is OK on success', async () => {
    const { obs, exporter } = makeTracedObs();
    await obs.withSpan('test.ok', {}, async () => {});

    const span = exporter.getFinishedSpans().find(s => s.name === 'test.ok');
    expect(span?.status.code).toBe(SpanStatusCode.OK);
  });

  test('span status is ERROR and exception recorded on throw', async () => {
    const { obs, exporter } = makeTracedObs();
    const err = new Error('stage failed');

    await expect(
      obs.withSpan('test.error', {}, async () => { throw err; })
    ).rejects.toThrow('stage failed');

    const span = exporter.getFinishedSpans().find(s => s.name === 'test.error');
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    expect(span?.status.message).toBe('stage failed');
    // recordException adds an event
    expect(span?.events.some(e => e.name === 'exception')).toBe(true);
  });

  test('span is always ended even when fn throws (no leak)', async () => {
    const { obs, exporter } = makeTracedObs();

    await expect(
      obs.withSpan('test.leak', {}, async () => { throw new Error('boom'); })
    ).rejects.toThrow();

    const span = exporter.getFinishedSpans().find(s => s.name === 'test.leak');
    // endTime is set (non-zero) → span was ended
    expect(span?.endTime[0]).toBeGreaterThan(0);
  });

  test('return value of fn is propagated', async () => {
    const { obs } = await makeTracedObs();
    const result = await obs.withSpan('test.ret', {}, async () => ({ answer: 42 }));
    expect(result).toEqual({ answer: 42 });
  });

  test('works with no-op tracer (OTel disabled) — no crash', async () => {
    const { withSpan } = _makeObservability(); // disabled, no-op tracer
    const result = await withSpan('noop.span', {}, async () => 'hello');
    expect(result).toBe('hello');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. recordStageSpan() — Wolf Engine pipeline stages
// ─────────────────────────────────────────────────────────────────────────────

describe('recordStageSpan()', () => {
  function makeTracedObs() {
    const exporter  = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);
    const provider  = new NodeTracerProvider({ spanProcessors: [processor] });
    const fakeTraceApi = { getTracer: (name, ver) => provider.getTracer(name, ver) };
    const { deps } = makeDeps();
    const obs = _makeObservability({ ...deps, traceApi: fakeTraceApi });
    return { obs, exporter };
  }

  test('span name follows wolf.pipeline.<stage> convention', async () => {
    const { obs, exporter } = makeTracedObs();
    await obs.recordStageSpan(STAGES.WHISPER, { requestId: 'req-1' }, async () => 'text');

    const span = exporter.getFinishedSpans().find(s => s.name === 'wolf.pipeline.whisper');
    expect(span).toBeDefined();
  });

  test('standard attributes are set on the span', async () => {
    const { obs, exporter } = makeTracedObs();
    await obs.recordStageSpan(
      STAGES.CLAUDE,
      { requestId: 'req-2', provider: 'claude-haiku' },
      async () => ({})
    );

    const span = exporter.getFinishedSpans().find(s => s.name === 'wolf.pipeline.claude');
    expect(span?.attributes['wolf.stage']).toBe('claude');
    expect(span?.attributes['wolf.request_id']).toBe('req-2');
    expect(span?.attributes['wolf.provider']).toBe('claude-haiku');
  });

  for (const stage of Object.values(STAGES)) {
    test(`stage "${stage}" produces a correctly-named span`, async () => {
      const { obs, exporter } = makeTracedObs();
      await obs.recordStageSpan(stage, { requestId: 'req-stage' }, async () => null);
      const span = exporter.getFinishedSpans().find(s => s.name === `wolf.pipeline.${stage}`);
      expect(span).toBeDefined();
    });
  }

  test('stage span status ERROR when fn throws', async () => {
    const { obs, exporter } = makeTracedObs();
    await expect(
      obs.recordStageSpan(STAGES.TTS, { requestId: 'req-err' }, async () => {
        throw new Error('tts down');
      })
    ).rejects.toThrow('tts down');

    const span = exporter.getFinishedSpans().find(s => s.name === 'wolf.pipeline.tts');
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
  });

  test('extra attrs from caller are merged into span', async () => {
    const { obs, exporter } = makeTracedObs();
    await obs.recordStageSpan(
      STAGES.OLLAMA,
      { requestId: 'req-3', 'wolf.retries': 2, 'wolf.breaker': 'closed' },
      async () => 'ok'
    );
    const span = exporter.getFinishedSpans().find(s => s.name === 'wolf.pipeline.ollama');
    expect(span?.attributes['wolf.retries']).toBe(2);
    expect(span?.attributes['wolf.breaker']).toBe('closed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Pipeline simulation — spans + metrics in concert
// ─────────────────────────────────────────────────────────────────────────────

describe('simulated pipeline — spans and metrics', () => {
  function makeTracedObs() {
    const exporter  = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);
    const provider  = new NodeTracerProvider({ spanProcessors: [processor] });
    const fakeTraceApi = { getTracer: (name, ver) => provider.getTracer(name, ver) };
    const { deps } = makeDeps();
    const obs = _makeObservability({ ...deps, traceApi: fakeTraceApi });
    return { obs, exporter };
  }

  /** Simulate a 4-stage pipeline using recordStageSpan. */
  async function runPipeline(obs, { failAt } = {}) {
    const requestId = 'sim-req-1';

    const transcription = await obs.recordStageSpan(
      STAGES.WHISPER, { requestId, provider: 'local-server' }, async () => {
        if (failAt === 'whisper') throw new Error('whisper fail');
        return 'bonjour';
      }
    );

    const analysis = await obs.recordStageSpan(
      STAGES.CLAUDE, { requestId, provider: 'claude-haiku' }, async () => {
        if (failAt === 'claude') throw new Error('claude fail');
        return { intent: 'create_event' };
      }
    );

    const enriched = await obs.recordStageSpan(
      STAGES.OLLAMA, { requestId, provider: 'llama3' }, async () => {
        if (failAt === 'ollama') return { strategy: 'ollama-error' };
        return { strategy: 'ollama', intent: 'create_event' };
      }
    );

    const audio = await obs.recordStageSpan(
      STAGES.TTS, { requestId, provider: 'mock' }, async () => {
        if (failAt === 'tts') throw new Error('tts fail');
        return { buffer: Buffer.alloc(4), ext: '.mp3', mimeType: 'audio/mpeg' };
      }
    );

    return { transcription, analysis, enriched, audio };
  }

  test('full success — 4 spans created, all status OK', async () => {
    const { obs, exporter } = makeTracedObs();
    await runPipeline(obs);

    const spans = exporter.getFinishedSpans();
    const stageNames = [STAGES.WHISPER, STAGES.CLAUDE, STAGES.OLLAMA, STAGES.TTS]
      .map(s => `wolf.pipeline.${s}`);

    for (const name of stageNames) {
      const span = spans.find(s => s.name === name);
      expect(span).toBeDefined();
      expect(span.status.code).toBe(SpanStatusCode.OK);
    }
  });

  test('whisper failure — whisper span is ERROR, claude/tts spans absent', async () => {
    const { obs, exporter } = makeTracedObs();

    await expect(runPipeline(obs, { failAt: 'whisper' })).rejects.toThrow('whisper fail');

    const spans = exporter.getFinishedSpans();
    const whisperSpan = spans.find(s => s.name === 'wolf.pipeline.whisper');
    expect(whisperSpan?.status.code).toBe(SpanStatusCode.ERROR);

    // Downstream stages were never reached
    expect(spans.find(s => s.name === 'wolf.pipeline.claude')).toBeUndefined();
    expect(spans.find(s => s.name === 'wolf.pipeline.tts')).toBeUndefined();
  });

  test('requestId attribute propagated to all spans', async () => {
    const { obs, exporter } = makeTracedObs();
    await runPipeline(obs);

    const spans = exporter.getFinishedSpans();
    for (const span of spans) {
      expect(span.attributes['wolf.request_id']).toBe('sim-req-1');
    }
  });

  test('ollama fallback (strategy:ollama-error) does not mark span as ERROR', async () => {
    const { obs, exporter } = makeTracedObs();
    await runPipeline(obs, { failAt: 'ollama' });

    const ollamaSpan = exporter.getFinishedSpans().find(s => s.name === 'wolf.pipeline.ollama');
    // fn returned without throwing → span should be OK
    expect(ollamaSpan?.status.code).toBe(SpanStatusCode.OK);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. getPipelineInstruments()
// ─────────────────────────────────────────────────────────────────────────────

describe('getPipelineInstruments()', () => {
  const _providers = [];

  function makeMeter() {
    const metricExporter = new InMemoryMetricExporter(/* temporality */ 0);
    const reader  = new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 100 });
    const provider = new MeterProvider({ readers: [reader] });
    _providers.push(provider); // track for cleanup
    const meter = provider.getMeter(SERVICE_NAME);
    return { meter, metricExporter, provider };
  }

  afterEach(async () => {
    // Shutdown all MeterProviders created in this describe block — prevents
    // the PeriodicExportingMetricReader interval from keeping the process alive.
    await Promise.all(_providers.map(p => p.shutdown().catch(() => {})));
    _providers.length = 0;
  });

  test('returns all four instruments', () => {
    const { meter } = makeMeter();
    const instruments = getPipelineInstruments(meter);

    expect(typeof instruments.stageLatency.record).toBe('function');
    expect(typeof instruments.stageErrors.add).toBe('function');
    expect(typeof instruments.pipelineSuccess.add).toBe('function');
    expect(typeof instruments.pipelineTotal.add).toBe('function');
  });

  test('instruments can be used without throwing', () => {
    const { meter } = makeMeter();
    const { stageLatency, stageErrors, pipelineSuccess, pipelineTotal } =
      getPipelineInstruments(meter);

    expect(() => {
      stageLatency.record(250, { stage: 'whisper', provider: 'local' });
      stageErrors.add(1,   { stage: 'claude',  reason: 'timeout' });
      pipelineSuccess.add(1);
      pipelineTotal.add(1, { status: 'success' });
    }).not.toThrow();
  });

  test('stageLatency records with correct labels', async () => {
    const { meter, metricExporter, provider } = makeMeter();
    const { stageLatency } = getPipelineInstruments(meter);

    stageLatency.record(123, { stage: 'tts', provider: 'elevenlabs' });

    // Force a collection cycle
    await provider.forceFlush();
    const metrics = metricExporter.getMetrics();
    const found = metrics.some(rm =>
      rm.scopeMetrics.some(sm =>
        sm.metrics.some(m => m.descriptor.name === 'wolf.pipeline.stage.duration')
      )
    );
    expect(found).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Fallback resilience — OTLP endpoint unavailable
// ─────────────────────────────────────────────────────────────────────────────

describe('resilience — OTLP endpoint unavailable', () => {
  test('init does not crash when OTLPTraceExporter constructor throws', async () => {
    // OTLPTraceExporter throws in its constructor — must be caught and swallowed.
    const { deps } = makeDeps({
      OTLPTraceExporter:  class { constructor() { throw new Error('network error'); } },
      BatchSpanProcessor: class { constructor() {} },  // never reached but kept for completeness
    });
    const { init } = _makeObservability(deps);
    await expect(init({ force: true, endpoint: 'http://unreachable:4318' }))
      .resolves.toBeUndefined();
  });

  test('withSpan works normally after failed init (no-op tracer fallback)', async () => {
    const { deps } = makeDeps({
      OTLPTraceExporter: class { constructor() { throw new Error('net'); } },
    });
    const { init, withSpan } = _makeObservability(deps);
    await init({ force: true, endpoint: 'http://unreachable:4318' });

    // SDK failed to start → _traceApi falls back to real OTel no-op tracer — must not throw.
    const result = await withSpan('fallback.span', {}, async () => 'safe');
    expect(result).toBe('safe');
  });

  test('shutdown is safe after failed init', async () => {
    const { deps } = makeDeps();
    deps.NodeSDK = class {
      start() { throw new Error('init error'); }
      async shutdown() {}
    };
    const { init, shutdown } = _makeObservability(deps);
    await init({ force: true });
    await expect(shutdown()).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. STAGES constant
// ─────────────────────────────────────────────────────────────────────────────

describe('STAGES constant', () => {
  test('contains all four pipeline stage names', () => {
    expect(STAGES.WHISPER).toBe('whisper');
    expect(STAGES.CLAUDE).toBe('claude');
    expect(STAGES.OLLAMA).toBe('ollama');
    expect(STAGES.TTS).toBe('tts');
    expect(STAGES.AGENT).toBe('agent.pipeline');
  });

  test('is frozen (immutable)', () => {
    expect(Object.isFrozen(STAGES)).toBe(true);
  });
});
