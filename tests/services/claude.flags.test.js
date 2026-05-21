// tests/services/claude.flags.test.js
// Covers: CLAUDE_NLU=false kill switch in claude.client.js

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/featureFlags.js', () => ({
  isEnabled: jest.fn(async (flag) => flag !== 'claude.nlu'), // CLAUDE_NLU disabled
  FLAGS: {
    CLAUDE_NLU: 'claude.nlu', OLLAMA_NLU: 'ollama.nlu',
    TRANSLATION: 'translation',
  },
  setFlag: jest.fn(), getAllFlags: jest.fn(), snapshotFlags: jest.fn(() => ({})), clearCache: jest.fn(),
}));

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    CLAUDE_API_KEY: 'sk-test-key', // key IS set — flag overrides it
    CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
  },
}));

jest.unstable_mockModule('../../src/infra/http/httpClient.js', () => ({
  apiFetch: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordRequest: jest.fn(), recordFailure: jest.fn(),
  recordLatency: jest.fn(), setCircuitState: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/circuitBreaker.js', () => ({
  CircuitBreaker:   jest.fn(() => ({ exec: jest.fn(), getState: jest.fn(() => 'CLOSED') })),
  CircuitOpenError: class extends Error {},
  TimeoutError:     class extends Error {},
  HttpError:        class extends Error { constructor(s, m) { super(m); this.status = s; } },
  withRetry:        jest.fn(async (fn) => fn()),
  STATE:            { CLOSED: 'CLOSED', HALF_OPEN: 'HALF_OPEN', OPEN: 'OPEN' },
}));

const { analyze } = await import('../../src/services/claude.client.js');

describe('CLAUDE_NLU=false kill switch', () => {
  test('falls back to rule-based when CLAUDE_NLU flag is disabled', async () => {
    const result = await analyze('créer un rendez-vous demain à 14h');
    // Rule-based result: strategy is 'rule-based'
    expect(result.strategy).toBe('rule-based');
  });

  test('returns rule-based even with valid API key when flag is off', async () => {
    const { apiFetch } = await import('../../src/infra/http/httpClient.js');
    await analyze('annuler mon rendez-vous');
    // apiFetch must never be called — flag gates before making API call
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('result has expected shape with rule-based strategy', async () => {
    const r = await analyze('annuler mon rendez-vous de lundi');
    expect(r.intent).toBe('cancel_event');
    expect(r.strategy).toBe('rule-based');
    expect(typeof r.confidence).toBe('number');
    expect(Array.isArray(r.errors)).toBe(true);
  });
});
