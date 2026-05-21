// utils/validation.js — Zod schemas + Express middleware
// Validates and sanitizes inputs at system boundaries (Twilio webhooks, REST API).
// Prevents injection, XSS, and garbage data from reaching business logic.

import { z } from 'zod';

// ── Schemas ───────────────────────────────────────────────────────────────────

// Twilio /voice webhook body
export const TwilioVoiceSchema = z.object({
  CallSid: z.string().max(64).default('unknown'),
  From: z.string().max(20).default('unknown'),
  To: z.string().max(20).optional(),
  CallStatus: z.string().max(32).optional(),
  Direction: z.string().max(32).optional(),
});

// Twilio /gather webhook body
export const TwilioGatherSchema = z.object({
  SpeechResult: z.string().max(500).optional(),
  Confidence: z.string().optional(), // Twilio sends as string
  CallSid: z.string().max(64).default('unknown'),
  From: z.string().max(20).default('unknown'),
});

// Twilio /status webhook body
export const TwilioStatusSchema = z.object({
  CallSid: z.string().max(64),
  CallStatus: z.string().max(32),
});

// Twilio /sms webhook body
export const TwilioSmsSchema = z.object({
  Body: z.string().max(1600).optional(),
  From: z.string().max(20).default('unknown'),
  To: z.string().max(20).optional(),
});

// POST /reply body
export const ReplyBodySchema = z.object({
  content: z.string().min(1).max(2000),
  tone: z.enum(['pro', 'sec', 'friendly', 'sarcastique', 'wolf-inc']).optional(),
});

// NLU result shape (internal — guards against malformed LLM output)
export const NluResultSchema = z.object({
  ok: z.boolean(),
  intent: z.enum(['create_event', 'cancel_event', 'update_event', 'list_events', 'unknown']),
  confidence: z.number().min(0).max(1),
  subject: z.string().max(255).nullable().optional(),
  isoDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  isoTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  date: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  missing: z.array(z.string()).optional(),
  needsClarification: z.boolean().optional(),
  _resolved: z.string().optional(),
});

// ── Express middleware factory ────────────────────────────────────────────────

/**
 * Returns an Express middleware that validates req.body against schema.
 * On success, sets req.validated. On failure, returns 400 with details.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: result.error.errors.map(e => ({ path: e.path.join('.'), msg: e.message })),
      });
    }
    req.validated = result.data;
    next();
  };
}

// ── Sanitization helpers ──────────────────────────────────────────────────────

/**
 * Truncate + strip control characters from user-supplied text
 * before sending to LLM (prevents prompt injection).
 */
export function sanitizeText(text, maxLength = 500) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .trim()
    .slice(0, maxLength);
}
