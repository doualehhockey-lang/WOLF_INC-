// tests/security/hmac-bypass.test.js
// Security invariant: twilioHmac middleware cannot be bypassed in production.
// Attacks: missing sig, empty sig, wrong length, wrong secret, replay on wrong endpoint.

import { jest } from '@jest/globals';
import crypto   from 'crypto';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../src/features/voice/twiml.builder.js', () => ({
  twimlError: () => '<?xml version="1.0"?><Response><Say>Error</Say></Response>',
}));

const mockCfg = {
  NODE_ENV:          'production',
  TWILIO_AUTH_TOKEN: 'super-secret-auth-token-1234567890',
  BASE_URL:          'https://wolf.example.com',
};
jest.unstable_mockModule('../../src/core/config.js', () => ({ config: mockCfg }));

const { twilioHmac } = await import('../../src/api/middleware/twilioHmac.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sign(url, params, secret = mockCfg.TWILIO_AUTH_TOKEN) {
  const canonical = Object.keys(params).sort().reduce((a, k) => a + k + params[k], url);
  return crypto.createHmac('sha1', secret).update(canonical).digest('base64');
}

function mkReq(sig, url = '/twilio/voice', body = {}) {
  return { headers: { 'x-twilio-signature': sig }, originalUrl: url, body };
}

function mkRes() {
  const r = { _s: 200, _t: '', _b: '' };
  r.status = (s) => { r._s = s; return r; };
  r.type   = (t) => { r._t = t; return r; };
  r.send   = (b) => { r._b = b; return r; };
  return r;
}

beforeEach(() => {
  mockCfg.NODE_ENV          = 'production';
  mockCfg.TWILIO_AUTH_TOKEN = 'super-secret-auth-token-1234567890';
  mockCfg.BASE_URL          = 'https://wolf.example.com';
});

// ── Skip conditions (non-production) ─────────────────────────────────────────

describe('bypass skip conditions', () => {
  test('development env skips HMAC check regardless of signature', () => {
    mockCfg.NODE_ENV = 'development';
    const next = jest.fn();
    twilioHmac(mkReq('totally-invalid-sig'), mkRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('test env skips HMAC check', () => {
    mockCfg.NODE_ENV = 'test';
    const next = jest.fn();
    twilioHmac(mkReq('bad'), mkRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('missing TWILIO_AUTH_TOKEN skips check (not yet configured)', () => {
    mockCfg.TWILIO_AUTH_TOKEN = '';
    const next = jest.fn();
    twilioHmac(mkReq('bad'), mkRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── Attack scenarios — must all return 401 ────────────────────────────────────

describe('HMAC bypass attacks — all must return 401', () => {
  test('missing X-Twilio-Signature header → 401', () => {
    const req  = { headers: {}, originalUrl: '/twilio/voice', body: {} };
    const res  = mkRes();
    const next = jest.fn();
    twilioHmac(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._s).toBe(401);
  });

  test('empty signature string → 401', () => {
    const res  = mkRes();
    const next = jest.fn();
    twilioHmac(mkReq(''), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._s).toBe(401);
  });

  test('signature computed with wrong secret → 401', () => {
    const params = { CallSid: 'CA123', From: '+33612345678' };
    const url    = mockCfg.BASE_URL + '/twilio/voice';
    const badSig = sign(url, params, 'wrong-secret-entirely');
    const res    = mkRes();
    const next   = jest.fn();
    twilioHmac(mkReq(badSig, '/twilio/voice', params), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._s).toBe(401);
  });

  test('replayed signature on different endpoint → 401', () => {
    const params       = { CallSid: 'CA999' };
    const sigForGather = sign(mockCfg.BASE_URL + '/twilio/gather', params);
    const res          = mkRes();
    const next         = jest.fn();
    // Send gather-signed request to /twilio/voice
    twilioHmac(mkReq(sigForGather, '/twilio/voice', params), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._s).toBe(401);
  });

  test('arbitrary base64 string of correct length → 401', () => {
    // HMAC-SHA1 is 28 chars in base64; craft a plausible-looking but wrong sig
    const fakeSig = Buffer.alloc(20, 0xff).toString('base64');
    const res     = mkRes();
    const next    = jest.fn();
    twilioHmac(mkReq(fakeSig, '/twilio/voice', { CallSid: 'CA000' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._s).toBe(401);
  });

  test('401 response is TwiML XML (Twilio expects XML, not JSON)', () => {
    const res = mkRes();
    twilioHmac(mkReq('invalid'), res, jest.fn());
    expect(res._t).toBe('text/xml');
    expect(res._b).toContain('<?xml');
  });
});

// ── Positive path — valid signature must pass ─────────────────────────────────

describe('valid HMAC-SHA1 signatures — must pass', () => {
  test('correct signature for /twilio/voice is accepted', () => {
    const url    = '/twilio/voice';
    const params = { CallSid: 'CA001', From: '+33611111111', Direction: 'inbound' };
    const sig    = sign(mockCfg.BASE_URL + url, params);
    const next   = jest.fn();
    twilioHmac(mkReq(sig, url, params), mkRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('params in non-alphabetical order are sorted before hashing — still accepted', () => {
    const url    = '/twilio/gather';
    const params = { Z_last: 'z', A_first: 'a', M_mid: 'm' };
    const sig    = sign(mockCfg.BASE_URL + url, params);
    const next   = jest.fn();
    twilioHmac(mkReq(sig, url, params), mkRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('empty body with correct signature is accepted', () => {
    const url    = '/twilio/voice';
    const params = {};
    const sig    = sign(mockCfg.BASE_URL + url, params);
    const next   = jest.fn();
    twilioHmac(mkReq(sig, url, params), mkRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
