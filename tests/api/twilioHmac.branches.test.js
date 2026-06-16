// tests/api/twilioHmac.branches.test.js
// Covers twilioHmac.js lines 22, 24 ?? right-side branches:
//   Line 22: req.headers['x-twilio-signature'] ?? '' — when header is absent
//   Line 24: req.body ?? {} — when body is null/undefined

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/features/voice/twiml.builder.js', () => ({
  twimlError: jest.fn(() => '<Response><Say>Error</Say></Response>'),
}));

// Production config with auth token to reach lines 22-24
jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
<<<<<<< HEAD
    NODE_ENV: 'production',
    TWILIO_AUTH_TOKEN: 'ACtest-branch-token',
    BASE_URL: 'https://example.com',
=======
    NODE_ENV:          'production',
    TWILIO_AUTH_TOKEN: 'ACtest-branch-token',
    BASE_URL:          'https://example.com',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
}));

const { twilioHmac } = await import('../../src/api/middleware/twilioHmac.js');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
<<<<<<< HEAD
  res.type = jest.fn(() => res);
  res.send = jest.fn(() => res);
=======
  res.type   = jest.fn(() => res);
  res.send   = jest.fn(() => res);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return res;
}

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 22: sig = req.headers['x-twilio-signature'] ?? '' — absent header
// ═════════════════════════════════════════════════════════════════════════════

describe('twilioHmac — missing x-twilio-signature header (line 22 right branch)', () => {
  test('treats absent signature header as empty string → rejects with 401', () => {
    const req = {
<<<<<<< HEAD
      headers: {}, // no x-twilio-signature → ?? '' right side
      body: { CallSid: 'CA-missing-sig' },
      originalUrl: '/twilio/voice',
    };
    const res = mockRes();
=======
      headers:     {},            // no x-twilio-signature → ?? '' right side
      body:        { CallSid: 'CA-missing-sig' },
      originalUrl: '/twilio/voice',
    };
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    twilioHmac(req, res, next);

    // Empty sig (from ??) doesn't match expected → 401
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 24: params = req.body ?? {} — null/undefined body
// ═════════════════════════════════════════════════════════════════════════════

describe('twilioHmac — null body (line 24 right branch)', () => {
  test('treats null body as empty object {} → sig mismatch → 401', () => {
    const req = {
<<<<<<< HEAD
      headers: { 'x-twilio-signature': 'any-sig' },
      body: null, // null → ?? {} right side
      originalUrl: '/twilio/voice',
    };
    const res = mockRes();
=======
      headers:     { 'x-twilio-signature': 'any-sig' },
      body:        null,          // null → ?? {} right side
      originalUrl: '/twilio/voice',
    };
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    twilioHmac(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('treats undefined body as empty object {} → sig mismatch → 401', () => {
    const req = {
<<<<<<< HEAD
      headers: { 'x-twilio-signature': 'another-sig' },
      body: undefined, // undefined → ?? {} right side
      originalUrl: '/twilio/gather',
    };
    const res = mockRes();
=======
      headers:     { 'x-twilio-signature': 'another-sig' },
      body:        undefined,     // undefined → ?? {} right side
      originalUrl: '/twilio/gather',
    };
    const res  = mockRes();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const next = jest.fn();

    twilioHmac(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
