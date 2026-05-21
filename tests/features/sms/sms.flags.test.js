// tests/features/sms/sms.flags.test.js
// Covers: PIPELINE_SMS=false kill switch in sms.controller.js

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/featureFlags.js', () => ({
  isEnabled: jest.fn(async () => false), // all flags disabled
  FLAGS: {
    PIPELINE_SMS: 'pipeline.sms',
    RATE_LIMIT:   'rate-limit',
  },
  setFlag: jest.fn(), getAllFlags: jest.fn(), snapshotFlags: jest.fn(() => ({})), clearCache: jest.fn(),
}));

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  smsTotal:     { inc: jest.fn() },
  errorCounter: { inc: jest.fn() },
  rateLimitCounter: { inc: jest.fn() },
  pipelineLatency:  { startTimer: jest.fn(() => jest.fn()) },
  activeSessions:   { set: jest.fn() },
}));

jest.unstable_mockModule('../../../src/features/voice/rate-limiter.js', () => ({
  isRateLimited: jest.fn(async () => false),
}));

const mockAutoReply = jest.fn(async () => 'reply');
jest.unstable_mockModule('../../../src/features/responder/responder.service.js', () => ({
  autoReply: mockAutoReply,
}));

jest.unstable_mockModule('../../../src/api/middleware/validation.js', () => ({
  sanitizeText: jest.fn((t) => t),
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
