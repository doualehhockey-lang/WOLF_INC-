// tests/services/claude.client.ruleBased.test.js
// Covers claude.client.js line 137: _ruleBased "aujourd'hui" branch
// The _ruleBased fallback is used when Claude API is unavailable (circuit open/no key).

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// No CLAUDE_API_KEY → forces _ruleBased fallback
jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    CLAUDE_API_KEY: '',   // empty → triggers _ruleBased fallback immediately
    CLAUDE_MODEL:   'claude-haiku-4-5-20251001',
  },
}));

jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordRequest:   jest.fn(),
  recordFailure:   jest.fn(),
  recordLatency:   jest.fn(),
  setCircuitState: jest.fn(),
}));

// Mock apiFetch — should NOT be called when falling back to _ruleBased
const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

const { analyze } = await import('../../src/services/claude.client.js');

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 137: _ruleBased "aujourd'hui" branch
// ═════════════════════════════════════════════════════════════════════════════

describe('_ruleBased — "aujourd\'hui" date branch (line 137)', () => {
  test('sets date to today when text contains "aujourd\'hui"', async () => {
    const result = await analyze("créer un rendez-vous aujourd'hui à 14h");
    // today's ISO date should appear
    const today = new Date().toISOString().slice(0, 10);
    expect(result.date).toBe(today);
    expect(result.strategy).toBe('rule-based');
  });

  test('sets intent to create_event and date to today', async () => {
    const result = await analyze("planifier un événement aujourd'hui");
    expect(result.intent).toBe('create_event');
    const today = new Date().toISOString().slice(0, 10);
    expect(result.date).toBe(today);
  });
});
