// tests/services/claude.client.timeout.test.js
// Covers claude.client.js TimeoutError branches:
//   Line 51 branch 4,0: _failureReason(TimeoutError) → 'timeout'
//   Line 58 branch 8,0: _requestStatus(TimeoutError) → 'timeout'
//
// Strategy: mock apiFetch to hang (never resolve) but listen to the AbortSignal.
// Use jest fake timers to advance past timeoutMs (30_000ms) → abort fires → TimeoutError.
// After 3 attempts (maxRetries=2), TimeoutError reaches _call catch block.

import { jest } from '@jest/globals';

jest.useFakeTimers();

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    CLAUDE_API_KEY: 'sk-timeout-key',
    CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
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

const { analyze } = await import('../../src/services/claude.client.js');

afterAll(() => {
  jest.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 51, 58: TimeoutError → 'timeout' in _failureReason and _requestStatus
// ═════════════════════════════════════════════════════════════════════════════

describe('TimeoutError branches — lines 51, 58', () => {
  test('all 3 attempts timeout → TimeoutError reaches _failureReason and _requestStatus', async () => {
    jest.clearAllMocks();
    // apiFetch hangs, listens for abort signal → rejects with AbortError when signal fires
    mockApiFetch.mockImplementation((_url, opts) =>
      new Promise((_resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      })
    );

    // analyze() → _call → withRetry → breaker.exec → apiFetch (hangs)
    // breaker.exec has timeoutMs=30_000 → setTimeout fires after 30s → ac.abort()
    // withRetry has backoff delays (~200ms, ~400ms) between retries
    const analyzePromise = analyze('annuler mon rendez-vous de jeudi');

    // Advance enough for all 3 attempts (30s each) + backoff delays (200+400ms)
    // Use runAllTimersAsync to process all pending timers and their callbacks
    await jest.advanceTimersByTimeAsync(31_000);  // attempt 0 timeout + backoff
    await jest.advanceTimersByTimeAsync(31_000);  // attempt 1 timeout + backoff
    await jest.advanceTimersByTimeAsync(31_000);  // attempt 2 timeout (final)

    const result = await analyzePromise;
    expect(result.strategy).toBe('rule-based');

    // _failureReason(TimeoutError) → 'timeout' (line 51 TRUE branch)
    expect(mockRecordFailure).toHaveBeenCalledWith('claude', 'timeout');
    // _requestStatus(TimeoutError) → 'timeout' (line 58 TRUE branch)
    expect(mockRecordRequest).toHaveBeenCalledWith('claude', 'timeout');
  });
});
