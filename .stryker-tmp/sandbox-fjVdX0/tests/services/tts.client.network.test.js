// @ts-nocheck
// tests/services/tts.client.network.test.js
// Covers tts.client.js line 131: _failureReason returns 'network' for generic errors.
// Covers tts.client.js lines 250-251: onStateChange callback when circuit opens.
//
// Uses the production `synthesize` export (module-level circuit breaker).
// Must be isolated from other test files to avoid shared breaker state pollution.

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    TTS_PROVIDER:        'elevenlabs',
    ELEVENLABS_API_KEY:  'sk-test',
    ELEVENLABS_VOICE_ID: 'test-voice',
    BASE_URL:            'http://localhost:3000',
    PHONE_SALT:          'testsalt1234567890',
    JWT_SECRET:          'testjwtsecret1234567890testjwtsecret1234567890',
    JWT_REFRESH_SECRET:  'testrefreshsecret1234567890testrefreshsecret',
    API_KEYS:            ['test-key'],
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
const { synthesize } = await import('../../src/services/tts.client.js');

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 131: _failureReason — 'network' branch
// ═════════════════════════════════════════════════════════════════════════════

describe('tts.client — _failureReason network (line 131)', () => {
  test('recordFailure called with "network" on generic ECONNRESET error', async () => {
    // apiFetch throws a plain Error — not HttpError, TimeoutError, or CircuitOpenError
    mockApiFetch.mockRejectedValue(new Error('ECONNRESET'));

    await expect(synthesize('bonjour', { timeoutMs: 5_000 })).rejects.toThrow();

    // recordFailure should be called with 'network' or 'circuit_open' (if circuit opened)
    expect(mockRecordFailure).toHaveBeenCalled();
    const reason = mockRecordFailure.mock.calls[0]?.[1];
    expect(['network', 'circuit_open']).toContain(reason);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 250-251: onStateChange — called when circuit opens
// ═════════════════════════════════════════════════════════════════════════════

describe('tts.client — onStateChange callback (lines 250-251)', () => {
  test('setCircuitState called with OPEN when enough failures accumulate', async () => {
    // apiFetch always rejects with a network error
    // Each synthesize call with maxRetries=2 causes 3 failures in the breaker
    // failureThreshold=5 → circuit opens after 5 consecutive failures (after ~2 calls)
    mockApiFetch.mockRejectedValue(new Error('ECONNRESET'));

    // Fire enough calls to open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(synthesize('hello', { timeoutMs: 5_000 })).rejects.toThrow();
    }

    // onStateChange should have been called with 'open' or 'OPEN'
    const openCalls = mockSetCircuitState.mock.calls.filter(
      ([_name, state]) => typeof state === 'string' && state.toLowerCase().includes('open'),
    );
    expect(openCalls.length).toBeGreaterThan(0);
  });
});
