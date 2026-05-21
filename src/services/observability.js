// src/services/observability.js — OpenTelemetry SDK for Wolf Engine.
//
// Provides:
//   init(opts?)       — initialize SDK (call once at startup, before any import of clients)
//   shutdown()        — flush + shut down SDK (call on process exit)
//   getTracer(name?)  — returns an OTel Tracer bound to this service
//   getMeter(name?)   — returns an OTel Meter bound to this service
//   withSpan(name, attrs, fn) — convenience wrapper: create span, run fn, set status
//   recordStageSpan(stage, attrs, fn) — shorthand for pipeline stage spans
//
// Design choices:
//   - Factory via _makeObservability(deps) for full DI testability.
//   - No global mutable state: each call to _makeObservability returns isolated state.
//   - Production singleton uses _makeObservability with real SDK constructors.
//   - OTLP endpoint is optional: falls back to no-op exporters when absent.
//   - Never throws on exporter errors — degraded-mode logging only.

import { trace, metrics, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { childLogger }                               from '../core/logger.js';
import { config }                                    from '../core/config.js';

const log = childLogger('observability');

// ── Constants ─────────────────────────────────────────────────────────────────

export const SERVICE_NAME    = 'wolf-engine';
export const SERVICE_VERSION = '2.0.0';

/** Pipeline stage names — used as span names and metric label values. */
export const STAGES = Object.freeze({
  WHISPER: 'whisper',
  CLAUDE:  'claude',
  OLLAMA:  'ollama',
  TTS:     'tts',
  AGENT:   'agent.pipeline',
});

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ObsDeps
 * @property {Function} [NodeSDK]                    constructor — @opentelemetry/sdk-node
 * @property {Function} [Resource]                   constructor — @opentelemetry/resources
 * @property {Function} [OTLPTraceExporter]          constructor — exporter-trace-otlp-http
 * @property {Function} [OTLPMetricExporter]         constructor — exporter-metrics-otlp-http
 * @property {Function} [PeriodicExportingMetricReader] constructor
 * @property {Function} [BatchSpanProcessor]         constructor
 * @property {Function} [InMemorySpanExporter]       constructor (tests only)
 * @property {Function} [HttpInstrumentation]        constructor
 * @property {Function} [ExpressInstrumentation]     constructor
 * @property {object}   [traceApi]                   override @opentelemetry/api trace namespace
 * @property {object}   [metricsApi]                 override @opentelemetry/api metrics namespace
 */

/**
 * Build an isolated observability instance.
 * Production code uses the module-level `init/shutdown/getTracer/getMeter` exports.
 * Tests inject mocked constructors to avoid real SDK side-effects.
 *
 * @param {ObsDeps} [deps]
 * @returns {{ init, shutdown, getTracer, getMeter, withSpan, recordStageSpan, _sdk }}
 */
export function _makeObservability(deps = {}) {
  let _sdk       = null;
  let _started   = false;

  // Allow tests to inject a fake api namespace (trace.getTracer, metrics.getMeter)
  const _traceApi   = deps.traceApi   ?? trace;
  const _metricsApi = deps.metricsApi ?? metrics;

  // ── init ──────────────────────────────────────────────────────────────────

  /**
   * Initialize the OpenTelemetry SDK.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   * If OTEL_ENABLED is false and no `opts.force` is passed, also a no-op.
   *
   * @param {object}  [opts]
   * @param {string}  [opts.endpoint]     OTLP HTTP endpoint (overrides config.OTEL_ENDPOINT)
   * @param {boolean} [opts.force=false]  Initialize even when OTEL_ENABLED=false (tests)
   * @param {object}  [opts.spanExporter] Inject a custom span exporter (tests)
   * @returns {Promise<void>}
   */
  async function init(opts = {}) {
    if (_started) return;

    const enabled  = config.OTEL_ENABLED || opts.force;
    const endpoint = opts.endpoint ?? config.OTEL_ENDPOINT;

    if (!enabled) {
      log.debug('OpenTelemetry disabled (OTEL_ENABLED=false) — using no-op providers');
      _started = true;
      return;
    }

    // ── Lazy-import SDK modules (avoids startup cost when OTel is disabled) ───
    const {
      NodeSDK,
      Resource,
      OTLPTraceExporter,
      OTLPMetricExporter,
      PeriodicExportingMetricReader,
      BatchSpanProcessor,
      HttpInstrumentation,
      ExpressInstrumentation,
    } = await _loadSDK(deps);

    // ── Resource (service identity) ───────────────────────────────────────────
    const resource = new Resource({
      'service.name':    SERVICE_NAME,
      'service.version': SERVICE_VERSION,
      'deployment.environment': config.NODE_ENV,
    });

    try {
      // ── Span exporter & processor ───────────────────────────────────────────
      let spanProcessor;
      if (opts.spanExporter) {
        // Test-injected exporter (e.g. InMemorySpanExporter)
        const { SimpleSpanProcessor } = await import('@opentelemetry/sdk-trace-node');
        spanProcessor = new SimpleSpanProcessor(opts.spanExporter);
      } else if (endpoint) {
        const traceExporter = new OTLPTraceExporter({
          url: `${endpoint}/v1/traces`,
          concurrencyLimit: 10,
        });
        spanProcessor = new BatchSpanProcessor(traceExporter, {
          maxQueueSize:         2048,
          maxExportBatchSize:   512,
          scheduledDelayMillis: 5_000,
          exportTimeoutMillis:  30_000,
        });
      } else {
        log.warn('OTEL_ENDPOINT not set — traces will not be exported');
        spanProcessor = null;
      }

      // ── Metric reader ───────────────────────────────────────────────────────
      let metricReader;
      if (endpoint) {
        const metricExporter = new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` });
        metricReader = new PeriodicExportingMetricReader({
          exporter:             metricExporter,
          exportIntervalMillis: 15_000,
          exportTimeoutMillis:  10_000,
        });
      }

      // ── Instrumentations ────────────────────────────────────────────────────
      const instrumentations = [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return url.startsWith('/health') || url === '/metrics';
          },
        }),
        new ExpressInstrumentation(),
      ];

      // ── Build & start SDK ───────────────────────────────────────────────────
      _sdk = new NodeSDK({
        resource,
        ...(spanProcessor ? { spanProcessor } : {}),
        ...(metricReader  ? { metricReader }  : {}),
        instrumentations,
      });

      _sdk.start();
      log.info({ endpoint: endpoint ?? 'none', env: config.NODE_ENV }, 'OpenTelemetry SDK started');
    } catch (err) {
      // Never crash the app if OTel init fails — degrade gracefully.
      log.error({ err: err.message }, 'OpenTelemetry SDK failed to start — continuing without telemetry');
      _sdk = null;
    }


    _started = true;
  }

  // ── shutdown ──────────────────────────────────────────────────────────────

  /**
   * Flush pending spans/metrics and shut down the SDK.
   * Call this in process SIGTERM / beforeExit handlers.
   * @returns {Promise<void>}
   */
  async function shutdown() {
    if (!_sdk) return;
    try {
      await _sdk.shutdown();
      log.info('OpenTelemetry SDK shut down cleanly');
    } catch (err) {
      log.warn({ err: err.message }, 'OpenTelemetry SDK shutdown error (non-fatal)');
    } finally {
      _sdk     = null;
      _started = false;
    }
  }

  // ── getTracer ─────────────────────────────────────────────────────────────

  /**
   * Get a tracer scoped to a given name.
   * Returns the no-op tracer when SDK is disabled — callers need not check.
   *
   * @param {string} [name='wolf-engine']
   * @returns {import('@opentelemetry/api').Tracer}
   */
  function getTracer(name = SERVICE_NAME) {
    return _traceApi.getTracer(name, SERVICE_VERSION);
  }

  // ── getMeter ──────────────────────────────────────────────────────────────

  /**
   * Get a meter scoped to a given name.
   * Returns the no-op meter when SDK is disabled.
   *
   * @param {string} [name='wolf-engine']
   * @returns {import('@opentelemetry/api').Meter}
   */
  function getMeter(name = SERVICE_NAME) {
    return _metricsApi.getMeter(name, SERVICE_VERSION);
  }

  // ── withSpan ──────────────────────────────────────────────────────────────

  /**
   * Create a span, run `fn(span)`, then end the span.
   * Sets span status to ERROR automatically if `fn` throws.
   * Always ends the span — no resource leaks.
   *
   * @param {string}   spanName
   * @param {object}   [attrs={}]   Span attributes added at creation time.
   * @param {Function} fn           Async or sync function receiving the span.
   * @param {object}   [spanOpts]   Extra options forwarded to tracer.startSpan.
   * @returns {Promise<*>}          Whatever `fn` returns.
   */
  async function withSpan(spanName, attrs = {}, fn, spanOpts = {}) {
    const tracer = getTracer();
    const span   = tracer.startSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes: attrs,
      ...spanOpts,
    });

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  }

  // ── recordStageSpan ───────────────────────────────────────────────────────

  /**
   * Convenience wrapper for Wolf Engine pipeline stages.
   * Creates a child span named `wolf.pipeline.<stage>` with standard attributes.
   *
   * @param {string}   stage       One of STAGES values.
   * @param {object}   attrs       At minimum: { requestId, provider? }
   * @param {Function} fn          Async fn(span) — wraps the stage logic.
   * @returns {Promise<*>}
   *
   * @example
   * const result = await recordStageSpan(STAGES.WHISPER, { requestId, provider: 'local-server' }, async (span) => {
   *   const text = await transcribeWav(buffer, { requestId });
   *   span.setAttribute('wolf.transcription.length', text.length);
   *   return text;
   * });
   */
  async function recordStageSpan(stage, attrs, fn) {
    const spanName = `wolf.pipeline.${stage}`;
    const fullAttrs = {
      'wolf.stage':      stage,
      'wolf.request_id': attrs.requestId ?? '',
      'wolf.provider':   attrs.provider  ?? stage,
      ...attrs,
    };
    return withSpan(spanName, fullAttrs, fn);
  }

  return { init, shutdown, getTracer, getMeter, withSpan, recordStageSpan, _sdk: () => _sdk };
}

// ── Lazy SDK loader (avoids importing all OTel modules at top-level) ──────────

async function _loadSDK(injected) {
  const [
    { NodeSDK },
    { Resource },
    { OTLPTraceExporter },
    { OTLPMetricExporter },
    { PeriodicExportingMetricReader },
    { BatchSpanProcessor },
    { HttpInstrumentation },
    { ExpressInstrumentation },
  ] = await Promise.all([
    injected.NodeSDK                    ? Promise.resolve({ NodeSDK: injected.NodeSDK })                                             : import('@opentelemetry/sdk-node'),
    injected.Resource                   ? Promise.resolve({ Resource: injected.Resource })                                           : import('@opentelemetry/resources'),
    injected.OTLPTraceExporter          ? Promise.resolve({ OTLPTraceExporter: injected.OTLPTraceExporter })                         : import('@opentelemetry/exporter-trace-otlp-http'),
    injected.OTLPMetricExporter         ? Promise.resolve({ OTLPMetricExporter: injected.OTLPMetricExporter })                       : import('@opentelemetry/exporter-metrics-otlp-http'),
    injected.PeriodicExportingMetricReader ? Promise.resolve({ PeriodicExportingMetricReader: injected.PeriodicExportingMetricReader }) : import('@opentelemetry/sdk-metrics'),
    injected.BatchSpanProcessor         ? Promise.resolve({ BatchSpanProcessor: injected.BatchSpanProcessor })                       : import('@opentelemetry/sdk-trace-node'),
    injected.HttpInstrumentation        ? Promise.resolve({ HttpInstrumentation: injected.HttpInstrumentation })                     : import('@opentelemetry/instrumentation-http'),
    injected.ExpressInstrumentation     ? Promise.resolve({ ExpressInstrumentation: injected.ExpressInstrumentation })               : import('@opentelemetry/instrumentation-express'),
  ]);

  return {
    NodeSDK, Resource,
    OTLPTraceExporter, OTLPMetricExporter,
    PeriodicExportingMetricReader,
    BatchSpanProcessor,
    HttpInstrumentation, ExpressInstrumentation,
  };
}

// ── Default production singleton ──────────────────────────────────────────────

const _default = _makeObservability();

/**
 * Initialize the production OTel SDK.
 * Call once at process startup, before starting the HTTP server.
 *
 * @example
 * import { init } from './src/services/observability.js';
 * await init();
 */
export const init              = _default.init;
export const shutdown          = _default.shutdown;
export const getTracer         = _default.getTracer;
export const getMeter          = _default.getMeter;
export const withSpan          = _default.withSpan;
export const recordStageSpan   = _default.recordStageSpan;

// ── Pipeline-level metric instruments (OTel Meter) ────────────────────────────
// These are created lazily via getter functions so the Meter is only resolved
// after init() has been called and the SDK provider is registered.

/**
 * Create (or return cached) OTel metric instruments for the pipeline.
 * Call after init() — safe to call repeatedly, instruments are cached.
 *
 * @param {import('@opentelemetry/api').Meter} [meter]  inject a custom meter (tests)
 * @returns {PipelineInstruments}
 *
 * @typedef {object} PipelineInstruments
 * @property {import('@opentelemetry/api').Histogram} stageLatency
 * @property {import('@opentelemetry/api').Counter}   stageErrors
 * @property {import('@opentelemetry/api').Counter}   pipelineSuccess
 * @property {import('@opentelemetry/api').Counter}   pipelineTotal
 */
export function getPipelineInstruments(meter) {
  const m = meter ?? getMeter();

  return {
    // Latency histogram per pipeline stage (labels: stage, provider)
    stageLatency: m.createHistogram('wolf.pipeline.stage.duration', {
      description: 'Duration of each Wolf Engine pipeline stage in milliseconds',
      unit:        'ms',
    }),

    // Error counter per stage + reason (labels: stage, reason)
    stageErrors: m.createCounter('wolf.pipeline.stage.errors', {
      description: 'Total pipeline stage errors',
    }),

    // End-to-end success counter
    pipelineSuccess: m.createCounter('wolf.pipeline.success', {
      description: 'Total end-to-end pipeline successes',
    }),

    // Total pipeline invocations (labels: status)
    pipelineTotal: m.createCounter('wolf.pipeline.total', {
      description: 'Total agent pipeline invocations',
    }),
  };
}
