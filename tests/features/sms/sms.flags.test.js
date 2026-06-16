// tests/features/sms/sms.flags.test.js
// Covers: PIPELINE_SMS=false kill switch in sms.controller.js

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/featureFlags.js', () => ({
  isEnabled: jest.fn(async () => false), // all flags disabled
  FLAGS: {
    PIPELINE_SMS: 'pipeline.sms',
<<<<<<< HEAD
    RATE_LIMIT: 'rate-limit',
  },
  setFlag: jest.fn(),
  getAllFlags: jest.fn(),
  snapshotFlags: jest.fn(() => ({})),
  clearCache: jest.fn(),
=======
    RATE_LIMIT:   'rate-limit',
  },
  setFlag: jest.fn(), getAllFlags: jest.fn(), snapshotFlags: jest.fn(() => ({})), clearCache: jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
<<<<<<< HEAD
  smsTotal: { inc: jest.fn() },
  errorCounter: { inc: jest.fn() },
  rateLimitCounter: { inc: jest.fn() },
  pipelineLatency: { startTimer: jest.fn(() => jest.fn()), observe: jest.fn() },
  nluLatency: { observe: jest.fn() },
  ttsLatency: { observe: jest.fn() },
  agentLatency: { observe: jest.fn() },
  intentCounter: { inc: jest.fn() },
  callsTotal: { inc: jest.fn() },
  activeSessions: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
  eventsStoredGauge: { set: jest.fn() },
  inflightTts: { inc: jest.fn(), dec: jest.fn() },
  ttsCacheHits: { inc: jest.fn() },
  circuitBreakerGauge: { set: jest.fn() },
=======
  smsTotal:     { inc: jest.fn() },
  errorCounter: { inc: jest.fn() },
  rateLimitCounter: { inc: jest.fn() },
  pipelineLatency:  { startTimer: jest.fn(() => jest.fn()) },
  activeSessions:   { set: jest.fn() },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

jest.unstable_mockModule('../../../src/features/voice/rate-limiter.js', () => ({
  isRateLimited: jest.fn(async () => false),
}));

const mockAutoReply = jest.fn(async () => 'reply');
jest.unstable_mockModule('../../../src/features/responder/responder.service.js', () => ({
  autoReply: mockAutoReply,
}));

jest.unstable_mockModule('../../../src/api/middleware/validation.js', () => ({
<<<<<<< HEAD
  sanitizeText: jest.fn(t => t),
=======
  sanitizeText: jest.fn((t) => t),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

const { handleSms } = await import('../../../src/features/sms/sms.controller.js');

function makeRes() {
  const res = { set: jest.fn(), send: jest.fn() };
  res.set.mockReturnValue(res);
  return res;
}

describe('PIPELINE_SMS=false kill switch', () => {
  test('returns empty XML and does not call autoReply when flag is off', async () => {
    const req = { body: { Body: 'test message', From: '+15005550001' } };
    const res = makeRes();

    await handleSms(req, res);

    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Response>'));
    expect(mockAutoReply).not.toHaveBeenCalled();
  });
});
