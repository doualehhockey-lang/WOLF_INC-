// src/api/middleware/validation.js — Zod schemas + Express validation middleware.
// Validates and sanitizes all inputs at system boundaries (Twilio webhooks, REST API).
// Prevents injection, XSS, and garbage data from reaching business logic.

import { z } from 'zod';

// ── Twilio webhook schemas ────────────────────────────────────────────────────

export const TwilioVoiceSchema = z.object({
<<<<<<< HEAD
  CallSid: z.string().max(64).default('unknown'),
  From: z.string().max(20).default('unknown'),
  To: z.string().max(20).optional(),
  CallStatus: z.string().max(32).optional(),
  Direction: z.string().max(32).optional(),
=======
  CallSid:     z.string().max(64).default('unknown'),
  From:        z.string().max(20).default('unknown'),
  To:          z.string().max(20).optional(),
  CallStatus:  z.string().max(32).optional(),
  Direction:   z.string().max(32).optional(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
});

export const TwilioGatherSchema = z.object({
  SpeechResult: z.string().max(500).optional(),
<<<<<<< HEAD
  Confidence: z.string().optional(),
  CallSid: z.string().max(64).default('unknown'),
  From: z.string().max(20).default('unknown'),
});

export const TwilioStatusSchema = z.object({
  CallSid: z.string().max(64),
=======
  Confidence:   z.string().optional(),
  CallSid:      z.string().max(64).default('unknown'),
  From:         z.string().max(20).default('unknown'),
});

export const TwilioStatusSchema = z.object({
  CallSid:    z.string().max(64),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  CallStatus: z.string().max(32),
});

export const TwilioSmsSchema = z.object({
  Body: z.string().max(1_600).optional(),
  From: z.string().max(20).default('unknown'),
<<<<<<< HEAD
  To: z.string().max(20).optional(),
=======
  To:   z.string().max(20).optional(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
});

// ── REST API schemas ──────────────────────────────────────────────────────────

export const ReplyBodySchema = z.object({
  content: z.string().min(1).max(2_000),
<<<<<<< HEAD
  tone: z.enum(['pro', 'sec', 'friendly', 'sarcastique', 'wolf-inc']).optional(),
=======
  tone:    z.enum(['pro', 'sec', 'friendly', 'sarcastique', 'wolf-inc']).optional(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
});

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Express middleware — validates req.body against schema.
 * On success sets req.validated; on failure returns 400.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
<<<<<<< HEAD
        error: 'VALIDATION_ERROR',
=======
        error:   'VALIDATION_ERROR',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        details: result.error.issues.map(e => ({ path: e.path.join('.'), msg: e.message })),
      });
    }
    req.validated = result.data;
    next();
  };
}

// ── Sanitization helpers ──────────────────────────────────────────────────────

/**
 * Strip control characters and truncate user text before passing to LLM.
 * Prevents prompt injection via malicious speech transcripts.
 */
export function sanitizeText(text, maxLength = 500) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}
