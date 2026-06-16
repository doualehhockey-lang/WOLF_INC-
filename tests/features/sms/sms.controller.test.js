// tests/features/sms/sms.controller.test.js
// handleSms: empty body, rate-limited, success, autoReply error, XML escaping.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
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
}));

// ── Mock rate-limiter ─────────────────────────────────────────────────────────
const mockIsRateLimited = jest.fn(async () => false);
jest.unstable_mockModule('../../../src/features/voice/rate-limiter.js', () => ({
  isRateLimited: mockIsRateLimited,
}));

// ── Mock sms.pipeline ─────────────────────────────────────────────────────────
const mockRunSmsPipeline = jest.fn(async () => 'Automatic reply');
jest.unstable_mockModule('../../../src/features/sms/sms.pipeline.js', () => ({
  runSmsPipeline: mockRunSmsPipeline,
}));

// ── Mock sanitizeText (passthrough) ──────────────────────────────────────────
jest.unstable_mockModule('../../../src/api/middleware/validation.js', () => ({
  sanitizeText: jest.fn(t => t ?? ''),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { handleSms } = await import('../../../src/features/sms/sms.controller.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockRes() {
  const res = {};
  res.set = jest.fn();
  res.send = jest.fn();
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsRateLimited.mockResolvedValue(false);
  mockRunSmsPipeline.mockResolvedValue('Automatic reply');
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
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Response></Response>'));
    expect(mockRunSmsPipeline).not.toHaveBeenCalled();
  });

  test('sends empty XML when Body is absent', async () => {
    const req = { body: { From: '+33600000001' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Response>'));
    expect(mockRunSmsPipeline).not.toHaveBeenCalled();
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
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Too many messages'));
    expect(mockRunSmsPipeline).not.toHaveBeenCalled();
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

describe('handleSms — pipeline error', () => {
  test('sends fallback XML message when pipeline throws', async () => {
    mockRunSmsPipeline.mockRejectedValueOnce(new Error('LLM unavailable'));
    const req = { body: { Body: 'Hi', From: '+33600000007' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('Service temporarily unavailable')
    );
  });

  test('increments errorCounter when pipeline throws', async () => {
    mockRunSmsPipeline.mockRejectedValueOnce(new Error('crash'));
    const req = { body: { Body: 'Hi', From: '+33600000008' } };
    await handleSms(req, mockRes());
    expect(mockErrorCounter.inc).toHaveBeenCalledWith(expect.objectContaining({ service: 'sms' }));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. XML escaping in reply text
// ═════════════════════════════════════════════════════════════════════════════

describe('handleSms — XML escaping', () => {
  test('escapes & in reply', async () => {
    mockRunSmsPipeline.mockResolvedValueOnce('Cookies & Cream');
    const req = { body: { Body: 'Test', From: '+33600000009' } };
    const res = mockRes();
    await handleSms(req, res);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('&amp;'));
  });

  test('escapes < and > in reply', async () => {
    mockRunSmsPipeline.mockResolvedValueOnce('a<b>c');
    const req = { body: { Body: 'Test', From: '+33600000010' } };
    const res = mockRes();
    await handleSms(req, res);
    const sent = res.send.mock.calls[0][0];
    expect(sent).toContain('&lt;');
    expect(sent).toContain('&gt;');
  });

  test('escapes " in reply', async () => {
    mockRunSmsPipeline.mockResolvedValueOnce('say "hello"');
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
