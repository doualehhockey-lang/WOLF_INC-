// @ts-nocheck
// tests/services/claude.client.http5xx.test.js
// Covers claude.client.js line 52 block 6 branch 0:
//   _failureReason: err.status >= 500 → 'http_5xx'
// HttpError(500) is retryable (not 4xx), so all 3 attempts fail → catch → http_5xx

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    CLAUDE_API_KEY: 'sk-http5xx-key',
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

// ═════════════════════════════════════════════════════════════════════════════
// Line 52 block 6 branch 0: status >= 500 → 'http_5xx' path in _failureReason
// ═════════════════════════════════════════════════════════════════════════════

describe('_failureReason http_5xx — line 52 branch 6,0', () => {
  test('HTTP 500 response → http_5xx failure reason (all 3 attempts fail)', async () => {
    // HttpError(500): _isRetryable returns true (500 is NOT 400-499), so all attempts run.
    // After maxRetries=2 (3 total), _failureReason(HttpError(500)) → 'http_5xx'
    const mock500 = {
      ok: false, status: 500,
      text: jest.fn(async () => 'Internal Server Error'),
      json: jest.fn(async () => ({})),
    };
    mockApiFetch
      .mockResolvedValueOnce(mock500)   // attempt 0 → HttpError(500)
      .mockResolvedValueOnce(mock500)   // attempt 1 → HttpError(500)
      .mockResolvedValueOnce(mock500);  // attempt 2 → HttpError(500), maxRetries reached → throw

    const result = await analyze('liste mes événements');
    expect(result.strategy).toBe('rule-based');

    // _failureReason(HttpError(500)) → 'http_5xx' (line 52 branch 6,0 TRUE = status >= 500)
    expect(mockRecordFailure).toHaveBeenCalledWith('claude', 'http_5xx');
  });
});
