// tests/api/validation.middleware.test.js
// validateBody: valid body → req.validated + next(), invalid → 400.
// sanitizeText: non-string, control chars, truncation, trimming.
// Zod schemas: TwilioVoiceSchema, TwilioGatherSchema, TwilioStatusSchema,
//              TwilioSmsSchema, ReplyBodySchema.

import { jest } from '@jest/globals';
import {
  validateBody,
  sanitizeText,
  TwilioVoiceSchema,
  TwilioGatherSchema,
  TwilioStatusSchema,
  TwilioSmsSchema,
  ReplyBodySchema,
} from '../../src/api/middleware/validation.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json   = jest.fn(() => res);
  return res;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. validateBody middleware
// ═════════════════════════════════════════════════════════════════════════════

describe('validateBody — valid input', () => {
  test('sets req.validated and calls next() for valid body', () => {
    const schema = TwilioVoiceSchema;
    const middleware = validateBody(schema);

    const req  = { body: { CallSid: 'CA123456789', From: '+33600000001' } };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validated).toBeDefined();
    expect(req.validated.CallSid).toBe('CA123456789');
    expect(res.status).not.toHaveBeenCalled();
  });

  test('applies schema defaults when optional fields are missing', () => {
    const middleware = validateBody(TwilioVoiceSchema);
    const req  = { body: {} };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validated.CallSid).toBe('unknown');
    expect(req.validated.From).toBe('unknown');
  });

  test('handles undefined req.body gracefully (uses {})', () => {
    const middleware = validateBody(TwilioVoiceSchema);
    const req  = {};
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('validateBody — invalid input', () => {
  test('returns 400 for ReplyBodySchema with missing content', () => {
    const middleware = validateBody(ReplyBodySchema);
    const req  = { body: {} };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'VALIDATION_ERROR' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 400 for ReplyBodySchema with invalid tone', () => {
    const middleware = validateBody(ReplyBodySchema);
    const req  = { body: { content: 'Hello', tone: 'invalid-tone' } };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('includes error details array in 400 response', () => {
    const middleware = validateBody(ReplyBodySchema);
    const req  = { body: {} };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
    expect(body.details[0]).toHaveProperty('path');
    expect(body.details[0]).toHaveProperty('msg');
  });

  test('returns 400 for TwilioStatusSchema with missing CallSid', () => {
    const middleware = validateBody(TwilioStatusSchema);
    const req  = { body: { CallStatus: 'completed' } };
    const res  = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. sanitizeText
// ═════════════════════════════════════════════════════════════════════════════

describe('sanitizeText — type guard', () => {
  test('returns empty string for non-string input (number)', () => {
    expect(sanitizeText(42)).toBe('');
  });

  test('returns empty string for null', () => {
    expect(sanitizeText(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(sanitizeText(undefined)).toBe('');
  });

  test('returns empty string for object', () => {
    expect(sanitizeText({})).toBe('');
  });
});

describe('sanitizeText — control character stripping', () => {
  test('strips null bytes (\\x00)', () => {
    expect(sanitizeText('hello\x00world')).toBe('helloworld');
  });

  test('strips backspace (\\x08)', () => {
    expect(sanitizeText('hello\x08')).toBe('hello');
  });

  test('strips form feed (\\x0C)', () => {
    expect(sanitizeText('line\x0Cfeed')).toBe('linefeed');
  });

  test('strips DEL (\\x7F)', () => {
    expect(sanitizeText('del\x7Fchar')).toBe('delchar');
  });

  test('preserves newline (\\x0A) and tab (\\x09)', () => {
    expect(sanitizeText('line\nbreak')).toContain('line');
    expect(sanitizeText('tab\there')).toContain('tab');
  });
});

describe('sanitizeText — trimming and truncation', () => {
  test('trims leading and trailing whitespace', () => {
    expect(sanitizeText('  hello world  ')).toBe('hello world');
  });

  test('truncates to maxLength (default 500)', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeText(long).length).toBe(500);
  });

  test('respects custom maxLength', () => {
    const text = 'hello world';
    expect(sanitizeText(text, 5)).toBe('hello');
  });

  test('does not truncate short strings', () => {
    expect(sanitizeText('short text', 100)).toBe('short text');
  });

  test('returns empty string for empty input', () => {
    expect(sanitizeText('')).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Zod schemas — parse success / failure
// ═════════════════════════════════════════════════════════════════════════════

describe('TwilioVoiceSchema', () => {
  test('parses valid voice webhook body', () => {
    const result = TwilioVoiceSchema.safeParse({
      CallSid: 'CA123', From: '+33600000001', To: '+33900000001',
    });
    expect(result.success).toBe(true);
  });

  test('rejects CallSid exceeding 64 chars', () => {
    const result = TwilioVoiceSchema.safeParse({ CallSid: 'C'.repeat(65) });
    expect(result.success).toBe(false);
  });
});

describe('TwilioGatherSchema', () => {
  test('parses with optional SpeechResult', () => {
    const result = TwilioGatherSchema.safeParse({
      SpeechResult: 'Bonjour', CallSid: 'CA999', From: '+33600000002',
    });
    expect(result.success).toBe(true);
    expect(result.data.SpeechResult).toBe('Bonjour');
  });

  test('parses without SpeechResult (optional)', () => {
    const result = TwilioGatherSchema.safeParse({ CallSid: 'CA000', From: '+33600000003' });
    expect(result.success).toBe(true);
  });
});

describe('TwilioStatusSchema', () => {
  test('parses valid status body', () => {
    const result = TwilioStatusSchema.safeParse({ CallSid: 'CA777', CallStatus: 'completed' });
    expect(result.success).toBe(true);
  });

  test('fails when CallSid is missing', () => {
    const result = TwilioStatusSchema.safeParse({ CallStatus: 'completed' });
    expect(result.success).toBe(false);
  });
});

describe('TwilioSmsSchema', () => {
  test('parses valid SMS body', () => {
    const result = TwilioSmsSchema.safeParse({ Body: 'Hello', From: '+33600000004' });
    expect(result.success).toBe(true);
  });

  test('rejects body longer than 1600 chars', () => {
    const result = TwilioSmsSchema.safeParse({ Body: 'a'.repeat(1601), From: '+33600000005' });
    expect(result.success).toBe(false);
  });
});

describe('ReplyBodySchema', () => {
  test('parses valid reply with all fields', () => {
    const result = ReplyBodySchema.safeParse({ content: 'Hello!', tone: 'friendly' });
    expect(result.success).toBe(true);
  });

  test('parses without optional tone', () => {
    const result = ReplyBodySchema.safeParse({ content: 'Hello!' });
    expect(result.success).toBe(true);
  });

  test('accepts all valid tone enum values', () => {
    ['pro', 'sec', 'friendly', 'sarcastique', 'wolf-inc'].forEach(tone => {
      const result = ReplyBodySchema.safeParse({ content: 'Test', tone });
      expect(result.success).toBe(true);
    });
  });

  test('rejects empty content', () => {
    const result = ReplyBodySchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  test('rejects content exceeding 2000 chars', () => {
    const result = ReplyBodySchema.safeParse({ content: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });
});
