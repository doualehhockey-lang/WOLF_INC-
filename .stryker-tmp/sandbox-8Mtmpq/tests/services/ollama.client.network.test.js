// @ts-nocheck
// tests/services/ollama.client.network.test.js
// Covers ollama.client.js lines 223-224: onStateChange callback fires when
// the module-level circuit breaker opens due to consecutive failures.

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    OLLAMA_URL:     'http://localhost:11434',
    OLLAMA_MODEL:   'llama3.2:3b',
    OLLAMA_TIMEOUT: 10_000,
  },
}));

const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

const mockRecordRequest   = jest.fn();
const mockRecordFailure   = jest.fn();
const mockRecordLatency   = jest.fn();
const mockSetCircuitState = jest.fn();
jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordRequest:   mockRecordRequest,
  recordFailure:   mockRecordFailure,
  recordLatency:   mockRecordLatency,
  setCircuitState: mockSetCircuitState,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { chat } = await import('../../src/services/ollama.client.js');

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 223-224: onStateChange — fires when circuit opens after failures
// ═════════════════════════════════════════════════════════════════════════════

describe('ollama.client — onStateChange (lines 223-224)', () => {
  test('setCircuitState called with OPEN after enough consecutive failures', async () => {
    // Each analyze() call that fails exhausts retries.
    // failureThreshold=5 → circuit opens after 5 consecutive failures.
    // With maxRetries=2 per call, each call causes 3 breaker failures.
    // Two failing calls → 6 failures > 5 → circuit opens.
    mockApiFetch.mockResolvedValue({
      ok:     false,
      status: 503,
      text:   async () => 'Service Unavailable',
      json:   async () => ({}),
    });

    const msgs = [{ role: 'user', content: 'test' }];
    for (let i = 0; i < 3; i++) {
      await expect(chat(msgs)).rejects.toThrow();
    }

    const openCalls = mockSetCircuitState.mock.calls.filter(
      ([_name, state]) => typeof state === 'string' && state.toLowerCase().includes('open'),
    );
    expect(openCalls.length).toBeGreaterThan(0);
  });
});
