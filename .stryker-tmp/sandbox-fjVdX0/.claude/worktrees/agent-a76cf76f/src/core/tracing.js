// @ts-nocheck
// src/core/tracing.js — OpenTelemetry tracing init/shutdown (no-op if OTEL_ENABLED=false).
import { config } from './config.js';
import { childLogger } from './logger.js';

const log = childLogger('tracing');

let _sdk = null;

export async function initTracing() {
  if (!config.otel.enabled) {
    log.debug('OpenTelemetry disabled (OTEL_ENABLED != true)');
    return;
  }

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

    const exporter = new OTLPTraceExporter({ url: `${config.otel.endpoint}/v1/traces` });

    _sdk = new NodeSDK({
      traceExporter: exporter,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    _sdk.start();
    log.info({ endpoint: config.otel.endpoint }, 'OpenTelemetry tracing started');
  } catch (err) {
    log.warn({ err: err.message }, 'OpenTelemetry init failed — running without tracing');
  }
}

export async function shutdownTracing() {
  if (_sdk) {
    try {
      await _sdk.shutdown();
      log.info('OpenTelemetry tracing shut down');
    } catch (err) {
      log.warn({ err: err.message }, 'OpenTelemetry shutdown error');
    }
  }
}
