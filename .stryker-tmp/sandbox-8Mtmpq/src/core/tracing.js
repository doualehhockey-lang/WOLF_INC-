// @ts-nocheck
// src/core/tracing.js — OpenTelemetry distributed tracing.
// Call initTracing() once at server startup before any other import.
// Ships spans to Jaeger / Grafana Tempo via OTLP HTTP exporter.
// Disable with OTEL_ENABLED=false (default). Configure via OTEL_ENDPOINT.

import { childLogger } from './logger.js';

const log = childLogger('tracing');

let _tracer = null;
let _sdk    = null;

/** Initialise the OTel SDK. No-op if OTEL_ENABLED !== 'true'. */
export async function initTracing() {
  if (process.env.OTEL_ENABLED !== 'true') {
    log.info('OpenTelemetry disabled (OTEL_ENABLED != true)');
    return;
  }

  try {
    const { NodeSDK }              = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter }    = await import('@opentelemetry/exporter-trace-otlp-http');
    const { getNodeAutoInstrumentations } =
      await import('@opentelemetry/auto-instrumentations-node');
    const { Resource }             = await import('@opentelemetry/resources');
    const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } =
      await import('@opentelemetry/semantic-conventions');

    const endpoint = process.env.OTEL_ENDPOINT ?? 'http://localhost:4318';

    _sdk = new NodeSDK({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]:    'wolf-engine',
        [SEMRESATTRS_SERVICE_VERSION]: '2.0.0',
      }),
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http':    { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
          '@opentelemetry/instrumentation-fs':      { enabled: false },
        }),
      ],
    });

    _sdk.start();

    const { trace } = await import('@opentelemetry/api');
    _tracer = trace.getTracer('wolf-engine', '2.0.0');

    log.info({ endpoint }, 'OpenTelemetry tracing initialised');
  } catch (err) {
    log.warn({ err: err.message }, 'OpenTelemetry init failed — tracing disabled');
  }
}

/** Create a child span for manual instrumentation. Returns a no-op if disabled. */
export function startSpan(name, attributes = {}) {
  if (!_tracer) return _noop();
  const span = _tracer.startSpan(name);
  if (Object.keys(attributes).length) span.setAttributes(attributes);
  return span;
}

/**
 * Wrap an async function in a named trace span.
 * @param {string}   name
 * @param {object}   attributes
 * @param {Function} fn  — receives the span as first argument
 */
export async function withSpan(name, attributes, fn) {
  const span = startSpan(name, attributes);
  try {
    const result = await fn(span);
    span.setStatus?.({ code: 1 }); // SpanStatusCode.OK
    return result;
  } catch (err) {
    span.recordException?.(err);
    span.setStatus?.({ code: 2, message: err.message }); // SpanStatusCode.ERROR
    throw err;
  } finally {
    span.end?.();
  }
}

/** Gracefully flush and shut down the OTel SDK on SIGTERM. */
export async function shutdownTracing() {
  if (!_sdk) return;
  await _sdk.shutdown().catch(err =>
    log.warn({ err: err.message }, 'Tracing shutdown error')
  );
  log.info('OpenTelemetry tracing shut down');
}

function _noop() {
  return {
    setAttributes:   () => {},
    setStatus:       () => {},
    recordException: () => {},
    end:             () => {},
  };
}
