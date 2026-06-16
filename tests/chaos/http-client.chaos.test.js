// tests/chaos/http-client.chaos.test.js
// Chaos tests: Claude client must survive every category of network failure.
// Every failure MUST fall back to rule-based — never crash, never propagate.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    CLAUDE_API_KEY: 'sk-test-chaos',
    CLAUDE_MODEL: 'claude-haiku-4-5-20251001',
  },
}));

const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordRequest: jest.fn(),
  recordFailure: jest.fn(),
  recordLatency: jest.fn(),
  setCircuitState: jest.fn(),
  auditLogFailures: { inc: jest.fn() },
}));

const mockBreaker = {
  exec: jest.fn(async fn => fn(new AbortController().signal)),
  getState: jest.fn(() => 'CLOSED'),
};

jest.unstable_mockModule('../../src/services/circuitBreaker.js', () => ({
  CircuitBreaker: jest.fn(() => mockBreaker),
  CircuitOpenError: class CircuitOpenError extends Error {
    constructor() {
      super('open');
    }
  },
  TimeoutError: class TimeoutError extends Error {
    constructor() {
      super('timeout');
    }
  },
  HttpError: class HttpError extends Error {
    constructor(s, m) {
      super(m);
      this.status = s;
    }
  },
  withRetry: jest.fn(async fn => fn()),
  STATE: { CLOSED: 'CLOSED', HALF_OPEN: 'HALF_OPEN', OPEN: 'OPEN' },
}));

const { analyze } = await import('../../src/services/claude.client.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockBreaker.exec.mockImplementation(async fn => fn(new AbortController().signal));
  mockBreaker.getState.mockReturnValue('CLOSED');
});

// ═════════════════════════════════════════════════════════════════════════════
// Network error chaos
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: network-layer failures → always returns rule-based', () => {
  const networkErrors = [
    [
      'ECONNREFUSED',
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' }),
    ],
    ['ETIMEDOUT', Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })],
    ['ECONNRESET', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })],
    [
      'ENOTFOUND',
      Object.assign(new Error('getaddrinfo ENOTFOUND api.anthropic.com'), { code: 'ENOTFOUND' }),
    ],
    ['EHOSTUNREACH', Object.assign(new Error('EHOSTUNREACH'), { code: 'EHOSTUNREACH' })],
  ];

  test.each(networkErrors)(
    '%s → returns rule-based strategy without throwing',
    async (_name, err) => {
      mockApiFetch.mockRejectedValueOnce(err);
      const result = await analyze('Créer un rendez-vous demain à 14h30');
      expect(result.strategy).toBe('rule-based');
      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// HTTP error status chaos
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: HTTP error responses → always returns rule-based', () => {
  const httpErrors = [
    ['500 Internal Server Error', 500, 'Internal Server Error'],
    ['502 Bad Gateway', 502, 'Bad Gateway'],
    ['503 Service Unavailable', 503, 'Service Unavailable'],
    ['429 Too Many Requests', 429, 'Too Many Requests'],
    ['504 Gateway Timeout', 504, 'Gateway Timeout'],
  ];

  test.each(httpErrors)('HTTP %s → falls back to rule-based', async (_label, status, body) => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status,
      text: async () => body,
      json: async () => {
        throw new Error('not JSON');
      },
    });
    const result = await analyze('Annuler mon rendez-vous de lundi');
    expect(result.strategy).toBe('rule-based');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Malformed response chaos
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: malformed API responses → always falls back', () => {
  test('json() throws SyntaxError → rule-based', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
      text: async () => '<html>Error</html>',
    });
    expect((await analyze('Modifier mon RDV')).strategy).toBe('rule-based');
  });

  test('response with no content field → rule-based', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ model: 'claude', stop_reason: 'end_turn' }), // no content
      text: async () => '',
    });
    expect((await analyze('Lister mes événements')).strategy).toBe('rule-based');
  });

  test('content[0] has no text field → rule-based', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text' }] }), // no text property
      text: async () => '',
    });
    expect(await analyze('Rendez-vous demain')).toMatchObject({ strategy: 'rule-based' });
  });

  test('Claude returns non-JSON text → rule-based', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ text: 'Je suis désolé, je ne peux pas aider avec ça.' }] }),
      text: async () => '',
    });
    expect((await analyze('Help')).strategy).toBe('rule-based');
  });

  test('Claude returns valid JSON but unknown intent → defaults applied', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ text: '{"foo":"bar","baz":42}' }] }),
      text: async () => '',
    });
    const result = await analyze('Rendez-vous');
    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0.8); // default when missing
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Circuit breaker chaos
// ═════════════════════════════════════════════════════════════════════════════

describe('Chaos: circuit breaker failures → always falls back', () => {
  test('circuit exec throws generic Error → rule-based', async () => {
    mockBreaker.exec.mockRejectedValueOnce(new Error('ECONNRESET during exec'));
    const result = await analyze('Créer un RDV');
    expect(result.strategy).toBe('rule-based');
  });
});
