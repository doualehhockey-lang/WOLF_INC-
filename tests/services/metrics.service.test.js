// tests/services/metrics.service.test.js
// Provider-level metrics helpers: recordRequest, recordFailure, recordLatency,
// setCircuitState, recordAgentRequest, recordAgentLatency,
// recordAgentStageFailure, recordPipelineSuccess.

import { jest } from '@jest/globals';

// ── Mock circuitBreaker (STATE constants only) ────────────────────────────────
jest.unstable_mockModule('../../src/services/circuitBreaker.js', () => ({
  STATE: { CLOSED: 'CLOSED', HALF_OPEN: 'HALF_OPEN', OPEN: 'OPEN' },
}));

// ── Import — metrics.js uses prom-client, NO network calls ────────────────────
const {
  recordRequest,
  recordFailure,
  recordLatency,
  setCircuitState,
  recordAgentRequest,
  recordAgentLatency,
  recordAgentStageFailure,
  recordPipelineSuccess,
  providerRegistry,
} = await import('../../src/services/metrics.js');

const { STATE } = await import('../../src/services/circuitBreaker.js');

// ═════════════════════════════════════════════════════════════════════════════
// 1. recordRequest
// ═════════════════════════════════════════════════════════════════════════════

describe('recordRequest', () => {
  test('does not throw for success status', () => {
    expect(() => recordRequest('claude', 'success')).not.toThrow();
  });

  test('does not throw for error status', () => {
    expect(() => recordRequest('claude', 'error')).not.toThrow();
  });

  test('does not throw for timeout status', () => {
    expect(() => recordRequest('claude', 'timeout')).not.toThrow();
  });

  test('does not throw for circuit_open status', () => {
    expect(() => recordRequest('claude', 'circuit_open')).not.toThrow();
  });

  test('defaults status to "success" when omitted', () => {
    expect(() => recordRequest('claude')).not.toThrow();
  });

  test('increments counter (metric value increases)', async () => {
    const before = await getCounterValue('provider_requests_total', {
      provider: 'test-req',
      status: 'success',
    });
    recordRequest('test-req', 'success');
    const after = await getCounterValue('provider_requests_total', {
      provider: 'test-req',
      status: 'success',
    });
    expect(after).toBe(before + 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. recordFailure
// ═════════════════════════════════════════════════════════════════════════════

describe('recordFailure', () => {
  test('does not throw for all known reasons', () => {
    ['network', 'timeout', 'http_4xx', 'http_5xx', 'circuit_open', 'unknown'].forEach(r => {
      expect(() => recordFailure('claude', r)).not.toThrow();
    });
  });

  test('defaults reason to "unknown"', () => {
    expect(() => recordFailure('claude')).not.toThrow();
  });

  test('increments failures counter', async () => {
    const before = await getCounterValue('provider_failures_total', {
      provider: 'test-fail',
      reason: 'network',
    });
    recordFailure('test-fail', 'network');
    const after = await getCounterValue('provider_failures_total', {
      provider: 'test-fail',
      reason: 'network',
    });
    expect(after).toBe(before + 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. recordLatency
// ═════════════════════════════════════════════════════════════════════════════

describe('recordLatency', () => {
  test('does not throw for any positive ms value', () => {
    expect(() => recordLatency('claude', 250)).not.toThrow();
    expect(() => recordLatency('claude', 0)).not.toThrow();
    expect(() => recordLatency('claude', 30_000)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. setCircuitState
// ═════════════════════════════════════════════════════════════════════════════

describe('setCircuitState', () => {
  test('sets gauge to 0 for CLOSED state', () => {
    expect(() => setCircuitState('claude', STATE.CLOSED)).not.toThrow();
  });

  test('sets gauge to 1 for HALF_OPEN state', () => {
    expect(() => setCircuitState('claude', STATE.HALF_OPEN)).not.toThrow();
  });

  test('sets gauge to 2 for OPEN state', () => {
    expect(() => setCircuitState('claude', STATE.OPEN)).not.toThrow();
  });

  test('handles unknown state gracefully (defaults to 0)', () => {
    expect(() => setCircuitState('claude', 'BOGUS_STATE')).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Agent-level metrics
// ═════════════════════════════════════════════════════════════════════════════

describe('recordAgentRequest', () => {
  test('does not throw for "success"', () => {
    expect(() => recordAgentRequest('success')).not.toThrow();
  });

  test('does not throw for "error"', () => {
    expect(() => recordAgentRequest('error')).not.toThrow();
  });

  test('defaults to "success"', () => {
    expect(() => recordAgentRequest()).not.toThrow();
  });
});

describe('recordAgentLatency', () => {
  test('does not throw for any ms value', () => {
    expect(() => recordAgentLatency(500)).not.toThrow();
    expect(() => recordAgentLatency(0)).not.toThrow();
  });
});

describe('recordAgentStageFailure', () => {
  test('does not throw for known stages and reasons', () => {
    ['whisper', 'claude', 'tts'].forEach(stage => {
      ['circuit_open', 'timeout', 'error'].forEach(reason => {
        expect(() => recordAgentStageFailure(stage, reason)).not.toThrow();
      });
    });
  });

  test('defaults reason to "error"', () => {
    expect(() => recordAgentStageFailure('whisper')).not.toThrow();
  });
});

describe('recordPipelineSuccess', () => {
  test('does not throw', () => {
    expect(() => recordPipelineSuccess()).not.toThrow();
  });

  test('increments counter', async () => {
    const before = await getCounterValue('agent_pipeline_success_total', {});
    recordPipelineSuccess();
    const after = await getCounterValue('agent_pipeline_success_total', {});
    expect(after).toBe(before + 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. providerRegistry
// ═════════════════════════════════════════════════════════════════════════════

describe('providerRegistry', () => {
  test('is exported and is a prom-client Registry', () => {
    expect(providerRegistry).toBeDefined();
    expect(typeof providerRegistry.getMetricsAsJSON).toBe('function');
  });

  test('getMetricsAsJSON returns an array', async () => {
    const metrics = await providerRegistry.getMetricsAsJSON();
    expect(Array.isArray(metrics)).toBe(true);
  });
});

// ── Helper — read counter value from registry ─────────────────────────────────
async function getCounterValue(name, labels) {
  const metrics = await providerRegistry.getMetricsAsJSON();
  const metric = metrics.find(m => m.name === name);
  if (!metric) return 0;
  const value = metric.values.find(v => {
    return Object.entries(labels).every(([k, lv]) => v.labels[k] === lv);
  });
  return value?.value ?? 0;
}
