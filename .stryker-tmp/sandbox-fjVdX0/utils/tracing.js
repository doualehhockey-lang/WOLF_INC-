// @ts-nocheck
// utils/tracing.js — OpenTelemetry distributed tracing.
// Must be imported FIRST in server.js (before any other module).
// Ships traces to Jaeger / Grafana Tempo via OTLP.
//
// To disable: set OTEL_ENABLED=false
// To configure endpoint: set OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

import { childLogger } from './logger.js';

const log = childLogger('tracing');

let _tracer = null;
let _sdk = null;

export async function initTracing() {
  if (process.env.OTEL_ENABLED === 'false') {
    log.info('OpenTelemetry disabled (OTEL_ENABLED=false)');
    return;
  }

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { getNodeAutoInstrumentations } =
      await import('@opentelemetry/auto-instrumentations-node');
    const { Resource } = await import('@opentelemetry/resources');
    const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } =
      await import('@opentelemetry/semantic-conventions');

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

    _sdk = new NodeSDK({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: 'wolf-engine',
        [SEMRESATTRS_SERVICE_VERSION]: '1.0.0',
      }),
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
          '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
        }),
      ],
    });

    _sdk.start();

    const { trace } = await import('@opentelemetry/api');
    _tracer = trace.getTracer('wolf-engine', '1.0.0');

    log.info({ endpoint }, 'OpenTelemetry tracing initialised');
  } catch (err) {
    log.warn({ err: err.message }, 'OpenTelemetry init failed — tracing disabled');
  }
}

/**
 * Create a child span for manual instrumentation.
 * Returns a no-op span if tracing is disabled.
 */
export function startSpan(name, attributes = {}) {
  if (!_tracer) return _noopSpan();

  const span = _tracer.startSpan(name);
  if (Object.keys(attributes).length) span.setAttributes(attributes);
  return span;
}

/**
 * Wrap an async function in a trace span.
 * @param {string}   name
 * @param {Object}   attributes
 * @param {Function} fn
 */
export async function withSpan(name, attributes, fn) {
  const span = startSpan(name, attributes);
  try {
    const result = await fn(span);
    span.setStatus?.({ code: 1 }); // SpanStatusCode.OK = 1
    return result;
  } catch (err) {
    span.recordException?.(err);
    span.setStatus?.({ code: 2, message: err.message }); // ERROR = 2
    throw err;
  } finally {
    span.end?.();
  }
}

export async function shutdownTracing() {
  if (_sdk) {
    await _sdk.shutdown().catch(err => log.warn({ err: err.message }, 'Tracing shutdown error'));
    log.info('OpenTelemetry tracing shut down');
  }
}

function _noopSpan() {
  return { setAttributes: () => {}, setStatus: () => {}, recordException: () => {}, end: () => {} };
}
