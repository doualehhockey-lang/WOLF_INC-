// tests/services/whisper.client.openai.test.js
// Covers whisper.client.js lines 100-101: OpenAI backend error path (res.ok=false).
// Covers whisper.client.js lines 233-234: onStateChange callback when circuit opens.
//
// Uses the production `transcribeWav` export (module-level circuit breaker).

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    WHISPER_BACKEND:    'openai',
    WHISPER_SERVER_URL: 'http://localhost:9000/transcribe',
    WHISPER_TIMEOUT:    15_000,
    OPENAI_API_KEY:     'sk-test-openai',
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
const { transcribeWav } = await import('../../src/services/whisper.client.js');

const validWav = Buffer.alloc(100, 0);

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 100-101: OpenAI error path — res.ok = false
// ═════════════════════════════════════════════════════════════════════════════

describe('whisper.client — OpenAI error path (lines 100-101)', () => {
  test('throws HttpError when OpenAI returns 4xx (no retry)', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok:     false,
      status: 401,
      text:   async () => 'Unauthorized',
      json:   async () => ({}),
    });

    const { HttpError } = await import('../../src/services/circuitBreaker.js');
    await expect(transcribeWav(validWav)).rejects.toBeInstanceOf(HttpError);
  });

  test('records http_4xx failure on OpenAI 4xx response', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok:     false,
      status: 403,
      text:   async () => 'Forbidden',
      json:   async () => ({}),
    });

    await expect(transcribeWav(validWav)).rejects.toThrow();
    expect(mockRecordFailure).toHaveBeenCalledWith('whisper', 'http_4xx');
  });

  test('res.text() error in OpenAI error path does not crash (catch → empty string)', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok:     false,
      status: 422,
      text:   async () => { throw new Error('text() failed'); },
      json:   async () => ({}),
    });

    // Should still throw HttpError, not crash with unhandled rejection
    await expect(transcribeWav(validWav)).rejects.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 233-234: onStateChange — called when circuit opens
// ═════════════════════════════════════════════════════════════════════════════

describe('whisper.client — onStateChange callback (lines 233-234)', () => {
  test('setCircuitState called with OPEN after enough consecutive failures', async () => {
    // Each transcribeWav call with maxRetries=2 causes up to 3 breaker failures
    // failureThreshold=5 → circuit opens after 5 consecutive failures
    // Use 5xx to enable retry (3 attempts per call)
    mockApiFetch.mockResolvedValue({
      ok:     false,
      status: 503,
      text:   async () => 'Service Unavailable',
      json:   async () => ({}),
    });

    for (let i = 0; i < 3; i++) {
      await expect(transcribeWav(validWav)).rejects.toThrow();
    }

    const openCalls = mockSetCircuitState.mock.calls.filter(
      ([_name, state]) => typeof state === 'string' && state.toLowerCase().includes('open'),
    );
    expect(openCalls.length).toBeGreaterThan(0);
  });
});
