// tests/features/sms/sms.controller.test.js
// handleSms: empty body, rate-limited, success, autoReply error, XML escaping.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockSmsTotal    = { inc: jest.fn() };
const mockErrorCounter = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  smsTotal:     mockSmsTotal,
  errorCounter: mockErrorCounter,
}));

// ── Mock rate-limiter ─────────────────────────────────────────────────────────
const mockIsRateLimited = jest.fn(async () => false);
jest.unstable_mockModule('../../../src/features/voice/rate-limiter.js', () => ({
  isRateLimited: mockIsRateLimited,
}));

// ── Mock autoReply ────────────────────────────────────────────────────────────
const mockAutoReply = jest.fn(async () => 'Réponse automatique');
jest.unstable_mockModule('../../../src/features/responder/responder.service.js', () => ({
  autoReply: mockAutoReply,
}));

// ── Mock sanitizeText (passthrough) ──────────────────────────────────────────
jest.unstable_mockModule('../../../src/api/middleware/validation.js', () => ({
  sanitizeText: jest.fn((t) => t ?? ''),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { handleSms } = await import('../../../src/features/sms/sms.controller.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockRes() {
  const res = {};
  res.set  = jest.fn();
  res.send = jest.fn();
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsRateLimited.mockResolvedValue(false);
  mockAutoReply.mockResolvedValue('Réponse automatique');
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Basic plumbing — Content-Type and smsTotal
// ═════════════════════════════════════════════════════════════════════════════

describe('handleSms — plumbing', () => {
  test('always sets Content-Type to text/xml', async () => {
    const req = { body: { Body: 'Hello', From: '+33600000001' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/xml; charset=utf-8');
  });

  test('always increments smsTotal', async () => {
    const req = { body: { Body: 'Hello', From: '+33600000001' } };
    await handleSms(req, mockRes());
    expect(mockSmsTotal.inc).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Empty body
// ═════════════════════════════════════════════════════════════════════════════

describe('handleSms — empty body', () => {
  test('sends empty XML response when Body is empty string', async () => {
    const req = { body: { Body: '', From: '+33600000001' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('<Response></Response>'),
    );
    expect(mockAutoReply).not.toHaveBeenCalled();
  });

  test('sends empty XML when Body is absent', async () => {
    const req = { body: { From: '+33600000001' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Response>'));
    expect(mockAutoReply).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Rate limited
// ═════════════════════════════════════════════════════════════════════════════

describe('handleSms — rate limited', () => {
  test('sends rate-limit message XML when rate limited', async () => {
    mockIsRateLimited.mockResolvedValueOnce(true);
    const req = { body: { Body: 'Hello', From: '+33600000002' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('Trop de messages'),
    );
    expect(mockAutoReply).not.toHaveBeenCalled();
  });

  test('checks rate limit with the From number', async () => {
    const req = { body: { Body: 'Hello', From: '+33600000003' } };
    await handleSms(req, mockRes());
    expect(mockIsRateLimited).toHaveBeenCalledWith('+33600000003');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Success path
// ═════════════════════════════════════════════════════════════════════════════

describe('handleSms — success', () => {
  test('calls autoReply with the sanitized body', async () => {
    const req = { body: { Body: 'Bonjour', From: '+33600000004' } };
    await handleSms(req, mockRes());
    expect(mockAutoReply).toHaveBeenCalledWith('Bonjour');
  });

  test('wraps autoReply result in XML <Message>', async () => {
    mockAutoReply.mockResolvedValueOnce('Bonjour!');
    const req = { body: { Body: 'Salut', From: '+33600000005' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('<Message>Bonjour!</Message>'),
    );
  });

  test('wraps reply in full XML response envelope', async () => {
    const req = { body: { Body: 'Test', From: '+33600000006' } };
    const res = mockRes();
    await handleSms(req, res);
    const sent = res.send.mock.calls[0][0];
    expect(sent).toMatch(/^<\?xml.*\?>/);
    expect(sent).toContain('<Response>');
    expect(sent).toContain('</Response>');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Error path — autoReply throws
// ═════════════════════════════════════════════════════════════════════════════

describe('handleSms — autoReply error', () => {
  test('sends fallback XML message when autoReply throws', async () => {
    mockAutoReply.mockRejectedValueOnce(new Error('LLM unavailable'));
    const req = { body: { Body: 'Hi', From: '+33600000007' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('Service temporairement indisponible'),
    );
  });

  test('increments errorCounter when autoReply throws', async () => {
    mockAutoReply.mockRejectedValueOnce(new Error('crash'));
    const req = { body: { Body: 'Hi', From: '+33600000008' } };
    await handleSms(req, mockRes());
    expect(mockErrorCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'sms' }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. XML escaping in reply text
// ═════════════════════════════════════════════════════════════════════════════

describe('handleSms — XML escaping', () => {
  test('escapes & in reply', async () => {
    mockAutoReply.mockResolvedValueOnce('Cookies & Cream');
    const req = { body: { Body: 'Test', From: '+33600000009' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('&amp;'));
  });

  test('escapes < and > in reply', async () => {
    mockAutoReply.mockResolvedValueOnce('a<b>c');
    const req = { body: { Body: 'Test', From: '+33600000010' } };
    const res = mockRes();
    await handleSms(req, res);
    const sent = res.send.mock.calls[0][0];
    expect(sent).toContain('&lt;');
    expect(sent).toContain('&gt;');
  });

  test('escapes " in reply', async () => {
    mockAutoReply.mockResolvedValueOnce('say "hello"');
    const req = { body: { Body: 'Test', From: '+33600000011' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('&quot;'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Default From value
// ═════════════════════════════════════════════════════════════════════════════

describe('handleSms — default From', () => {
  test('uses "unknown" as From when not provided', async () => {
    const req = { body: { Body: 'Hello' } };
    await handleSms(req, mockRes());
    expect(mockIsRateLimited).toHaveBeenCalledWith('unknown');
  });
});
