// @ts-nocheck
// src/services/metrics.js — Provider-level Prometheus metrics.
//
// Uses a SEPARATE Registry to avoid "metric already registered" conflicts with
// src/core/metrics.js which calls collectDefaultMetrics() on the default registry.
//
// Exported helpers are safe to call from any provider client.

import promClient from 'prom-client';
import { STATE }  from './circuitBreaker.js';

// ── Isolated registry ─────────────────────────────────────────────────────────

export const providerRegistry = new promClient.Registry();

// ── Metrics ───────────────────────────────────────────────────────────────────

const requestsTotal = new promClient.Counter({
  name:       'provider_requests_total',
  help:       'Total requests to external providers',
  labelNames: ['provider', 'status'], // status: success | error | timeout | circuit_open
  registers:  [providerRegistry],
});

const failuresTotal = new promClient.Counter({
  name:       'provider_failures_total',
  help:       'Total provider failures, labelled by failure reason',
  labelNames: ['provider', 'reason'], // reason: network | timeout | http_4xx | http_5xx | circuit_open | unknown
  registers:  [providerRegistry],
});

const latencyMs = new promClient.Histogram({
  name:       'provider_latency_ms',
  help:       'Provider end-to-end request latency in milliseconds',
  labelNames: ['provider'],
  buckets:    [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000],
  registers:  [providerRegistry],
});

const circuitBreakerState = new promClient.Gauge({
  name:       'provider_circuit_breaker_state',
  help:       'Circuit breaker state gauge: 0=closed, 1=half_open, 2=open',
  labelNames: ['provider'],
  registers:  [providerRegistry],
});

// ── State → numeric ───────────────────────────────────────────────────────────

const _STATE_VALUE = {
  [STATE.CLOSED]:    0,
  [STATE.HALF_OPEN]: 1,
  [STATE.OPEN]:      2,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Record a completed request (success or failure label).
 * @param {string} provider   e.g. 'claude', 'ollama'
 * @param {string} [status]   'success' | 'error' | 'timeout' | 'circuit_open'
 */
export function recordRequest(provider, status = 'success') {
  requestsTotal.labels(provider, status).inc();
}

/**
 * Record a provider failure with its reason.
 * @param {string} provider
 * @param {string} [reason]  'network' | 'timeout' | 'http_4xx' | 'http_5xx' | 'circuit_open' | 'unknown'
 */
export function recordFailure(provider, reason = 'unknown') {
  failuresTotal.labels(provider, reason).inc();
}

/**
 * Observe a request latency sample.
 * @param {string} provider
 * @param {number} ms         Elapsed milliseconds
 */
export function recordLatency(provider, ms) {
  latencyMs.labels(provider).observe(ms);
}

/**
 * Set the circuit breaker state gauge.
 * @param {string} provider
 * @param {string} state  STATE.CLOSED | STATE.HALF_OPEN | STATE.OPEN
 */
export function setCircuitState(provider, state) {
  const val = _STATE_VALUE[state] ?? 0;
  circuitBreakerState.labels(provider).set(val);
}

// ── Agent-level metrics ───────────────────────────────────────────────────────

const agentRequestsTotal = new promClient.Counter({
  name:       'agent_requests_total',
  help:       'Total agent pipeline invocations',
  labelNames: ['status'], // success | error
  registers:  [providerRegistry],
});

const agentLatencyMs = new promClient.Histogram({
  name:    'agent_latency_ms',
  help:    'Full agent pipeline latency in milliseconds',
  buckets: [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000],
  registers: [providerRegistry],
});

const agentStageFailuresTotal = new promClient.Counter({
  name:       'agent_stage_failures_total',
  help:       'Agent pipeline stage failures',
  labelNames: ['stage', 'reason'], // stage: whisper|claude|ollama|tts, reason: circuit_open|timeout|error
  registers:  [providerRegistry],
});

const agentPipelineSuccessTotal = new promClient.Counter({
  name:      'agent_pipeline_success_total',
  help:      'Total agent pipelines completed successfully end-to-end',
  registers: [providerRegistry],
});

/**
 * Record the outcome of an agent pipeline run.
 * @param {string} status  'success' | 'error'
 */
export function recordAgentRequest(status = 'success') {
  agentRequestsTotal.labels(status).inc();
}

/**
 * Observe agent pipeline latency.
 * @param {number} ms
 */
export function recordAgentLatency(ms) {
  agentLatencyMs.observe(ms);
}

/**
 * Record a stage-level failure within the agent pipeline.
 * @param {string} stage   'whisper' | 'claude' | 'ollama' | 'tts'
 * @param {string} reason  'circuit_open' | 'timeout' | 'error'
 */
export function recordAgentStageFailure(stage, reason = 'error') {
  agentStageFailuresTotal.labels(stage, reason).inc();
}

/**
 * Increment the end-to-end pipeline success counter.
 */
export function recordPipelineSuccess() {
  agentPipelineSuccessTotal.inc();
}
