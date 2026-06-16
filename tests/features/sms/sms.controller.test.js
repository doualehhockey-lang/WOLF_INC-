// tests/features/sms/sms.controller.test.js
// handleSms: empty body, rate-limited, success, autoReply error, XML escaping.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
<<<<<<< HEAD
const mockSmsTotal = { inc: jest.fn() };
const mockErrorCounter = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  smsTotal: mockSmsTotal,
  errorCounter: mockErrorCounter,
  auditLogFailures: { inc: jest.fn() },
  pipelineLatency: { observe: jest.fn() },
  nluLatency: { observe: jest.fn() },
  ttsLatency: { observe: jest.fn() },
  agentLatency: { observe: jest.fn() },
  intentCounter: { inc: jest.fn() },
  rateLimitCounter: { inc: jest.fn() },
  callsTotal: { inc: jest.fn() },
  activeSessions: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
}));

// ── Mock featureFlags ─────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/featureFlags.js', () => ({
  isEnabled: jest.fn(async () => true),
  FLAGS: { PIPELINE_SMS: 'pipeline_sms' },
=======
const mockSmsTotal    = { inc: jest.fn() };
const mockErrorCounter = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  smsTotal:     mockSmsTotal,
  errorCounter: mockErrorCounter,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Mock rate-limiter ─────────────────────────────────────────────────────────
const mockIsRateLimited = jest.fn(async () => false);
jest.unstable_mockModule('../../../src/features/voice/rate-limiter.js', () => ({
  isRateLimited: mockIsRateLimited,
}));

<<<<<<< HEAD
// ── Mock sms.pipeline ─────────────────────────────────────────────────────────
const mockRunSmsPipeline = jest.fn(async () => 'Automatic reply');
jest.unstable_mockModule('../../../src/features/sms/sms.pipeline.js', () => ({
  runSmsPipeline: mockRunSmsPipeline,
=======
// ── Mock autoReply ────────────────────────────────────────────────────────────
const mockAutoReply = jest.fn(async () => 'Réponse automatique');
jest.unstable_mockModule('../../../src/features/responder/responder.service.js', () => ({
  autoReply: mockAutoReply,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Mock sanitizeText (passthrough) ──────────────────────────────────────────
jest.unstable_mockModule('../../../src/api/middleware/validation.js', () => ({
<<<<<<< HEAD
  sanitizeText: jest.fn(t => t ?? ''),
=======
  sanitizeText: jest.fn((t) => t ?? ''),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { handleSms } = await import('../../../src/features/sms/sms.controller.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockRes() {
  const res = {};
<<<<<<< HEAD
  res.set = jest.fn();
=======
  res.set  = jest.fn();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  res.send = jest.fn();
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsRateLimited.mockResolvedValue(false);
<<<<<<< HEAD
  mockRunSmsPipeline.mockResolvedValue('Automatic reply');
=======
  mockAutoReply.mockResolvedValue('Réponse automatique');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Response></Response>'));
    expect(mockRunSmsPipeline).not.toHaveBeenCalled();
=======
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('<Response></Response>'),
    );
    expect(mockAutoReply).not.toHaveBeenCalled();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('sends empty XML when Body is absent', async () => {
    const req = { body: { From: '+33600000001' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Response>'));
<<<<<<< HEAD
    expect(mockRunSmsPipeline).not.toHaveBeenCalled();
=======
    expect(mockAutoReply).not.toHaveBeenCalled();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Too many messages'));
    expect(mockRunSmsPipeline).not.toHaveBeenCalled();
=======
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('Trop de messages'),
    );
    expect(mockAutoReply).not.toHaveBeenCalled();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
  test('calls runSmsPipeline with text, from, sid', async () => {
    const req = { body: { Body: 'Hello', From: '+33600000004', MessageSid: 'SM123' } };
    await handleSms(req, mockRes());
    expect(mockRunSmsPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello', from: '+33600000004', sid: 'SM123' })
    );
  });

  test('wraps pipeline result in XML <Message>', async () => {
    mockRunSmsPipeline.mockResolvedValueOnce('Hello back!');
    const req = { body: { Body: 'Hi', From: '+33600000005' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('<Message>Hello back!</Message>')
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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

<<<<<<< HEAD
describe('handleSms — pipeline error', () => {
  test('sends fallback XML message when pipeline throws', async () => {
    mockRunSmsPipeline.mockRejectedValueOnce(new Error('LLM unavailable'));
=======
describe('handleSms — autoReply error', () => {
  test('sends fallback XML message when autoReply throws', async () => {
    mockAutoReply.mockRejectedValueOnce(new Error('LLM unavailable'));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const req = { body: { Body: 'Hi', From: '+33600000007' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(
<<<<<<< HEAD
      expect.stringContaining('Service temporarily unavailable')
    );
  });

  test('increments errorCounter when pipeline throws', async () => {
    mockRunSmsPipeline.mockRejectedValueOnce(new Error('crash'));
    const req = { body: { Body: 'Hi', From: '+33600000008' } };
    await handleSms(req, mockRes());
    expect(mockErrorCounter.inc).toHaveBeenCalledWith(expect.objectContaining({ service: 'sms' }));
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. XML escaping in reply text
// ═════════════════════════════════════════════════════════════════════════════

describe('handleSms — XML escaping', () => {
  test('escapes & in reply', async () => {
<<<<<<< HEAD
    mockRunSmsPipeline.mockResolvedValueOnce('Cookies & Cream');
=======
    mockAutoReply.mockResolvedValueOnce('Cookies & Cream');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const req = { body: { Body: 'Test', From: '+33600000009' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('&amp;'));
  });

  test('escapes < and > in reply', async () => {
<<<<<<< HEAD
    mockRunSmsPipeline.mockResolvedValueOnce('a<b>c');
=======
    mockAutoReply.mockResolvedValueOnce('a<b>c');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const req = { body: { Body: 'Test', From: '+33600000010' } };
    const res = mockRes();
    await handleSms(req, res);
    const sent = res.send.mock.calls[0][0];
    expect(sent).toContain('&lt;');
    expect(sent).toContain('&gt;');
  });

  test('escapes " in reply', async () => {
<<<<<<< HEAD
    mockRunSmsPipeline.mockResolvedValueOnce('say "hello"');
=======
    mockAutoReply.mockResolvedValueOnce('say "hello"');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
