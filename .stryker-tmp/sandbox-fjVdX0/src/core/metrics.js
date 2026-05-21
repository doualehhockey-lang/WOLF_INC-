// @ts-nocheck
// src/core/metrics.js — Prometheus metrics registry for Wolf Engine.
// Exposes histograms, counters and gauges consumed by /metrics endpoint.
// Grafana dashboards visualize these via the Prometheus datasource.

import promClient from 'prom-client';

// Collect default Node.js metrics (heap, GC, event loop lag, etc.)
const defaultInterval = promClient.collectDefaultMetrics({ prefix: 'wolf_' });
if (defaultInterval && typeof defaultInterval.unref === 'function') {
  defaultInterval.unref();
}

// ── Histograms (latency distributions) ───────────────────────────────────────

export const pipelineLatency = new promClient.Histogram({
  name:       'wolf_pipeline_duration_ms',
  help:       'End-to-end voice pipeline latency (NLU + Agent + TTS)',
  labelNames: ['intent', 'success'],
  buckets:    [50, 100, 250, 500, 1000, 2500, 5000, 12000],
});

export const nluLatency = new promClient.Histogram({
  name:       'wolf_nlu_duration_ms',
  help:       'NLU (Claude/Ollama) processing time',
  labelNames: ['provider', 'success'],
  buckets:    [50, 100, 250, 500, 1000, 3000],
});

export const ttsLatency = new promClient.Histogram({
  name:       'wolf_tts_duration_ms',
  help:       'TTS synthesis latency',
  labelNames: ['provider', 'success'],
  buckets:    [100, 250, 500, 1000, 2500, 5000],
});

export const agentLatency = new promClient.Histogram({
  name:       'wolf_agent_duration_ms',
  help:       'Agent dispatch latency (DB read/write)',
  labelNames: ['intent', 'success'],
  buckets:    [1, 5, 10, 25, 50, 100, 500],
});

// ── Counters (monotonically increasing totals) ────────────────────────────────

export const intentCounter = new promClient.Counter({
  name:       'wolf_intents_total',
  help:       'Total intents detected by NLU',
  labelNames: ['intent', 'resolved'],
});

export const errorCounter = new promClient.Counter({
  name:       'wolf_errors_total',
  help:       'Total errors by service and type',
  labelNames: ['service', 'errorType'],
});

export const rateLimitCounter = new promClient.Counter({
  name: 'wolf_rate_limit_total',
  help: 'Total rate-limited requests',
});

export const ttsCacheHits = new promClient.Counter({
  name:       'wolf_tts_cache_hits_total',
  help:       'TTS cache hits',
  labelNames: ['type'], // 'inflight' | 'memory' | 'redis'
});

export const callsTotal = new promClient.Counter({
  name: 'wolf_calls_total',
  help: 'Total incoming Twilio voice calls',
});

export const smsTotal = new promClient.Counter({
  name: 'wolf_sms_total',
  help: 'Total incoming SMS messages',
});

// ── Gauges (current instantaneous values) ────────────────────────────────────

export const activeSessions = new promClient.Gauge({
  name: 'wolf_active_sessions',
  help: 'Currently active call sessions',
});

export const inflightTts = new promClient.Gauge({
  name: 'wolf_inflight_tts',
  help: 'TTS synthesis promises currently in-flight (dedup map)',
});

export const eventsStoredGauge = new promClient.Gauge({
  name: 'wolf_events_stored',
  help: 'Total events stored across all users',
});

export const circuitBreakerGauge = new promClient.Gauge({
  name:       'wolf_circuit_breaker_state',
  help:       'Circuit breaker state: 0=closed (healthy), 1=open (failing)',
  labelNames: ['service'],
});

// ── Registry ──────────────────────────────────────────────────────────────────

export const register = promClient.register;
