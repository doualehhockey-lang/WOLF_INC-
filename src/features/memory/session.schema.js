// src/features/memory/session.schema.js — Zod schema for conversational sessions.
// Validates session objects on read from Redis / in-memory store.
// Corrupt data is caught early and replaced with a fresh default session.

import { z } from 'zod';

const TurnSchema = z.object({
  role: z.enum(['user', 'agent']),
  content: z.string(),
  ts: z.number().int().positive(),
  intent: z.string().optional(),
  isoDate: z.string().nullable().optional(),
  isoTime: z.string().nullable().optional(),
  subject: z.string().optional(),
});

export const SessionSchema = z.object({
  callSid: z.string().min(1),
  turns: z.array(TurnSchema).default([]),
  lang: z.string().default('fr'),
  pendingIntent: z.string().nullable().default(null),
  pendingDate: z.string().nullable().default(null),
  pendingTime: z.string().nullable().default(null),
  pendingSubject: z.string().nullable().default(null),
  lastActivity: z
    .number()
    .int()
    .positive()
    .default(() => Date.now()),
});

/** @typedef {z.infer<typeof SessionSchema>} Session */

/**
 * Parse raw JSON data as a Session.  Returns null if validation fails.
 * @param {unknown} raw
 * @returns {Session|null}
 */
export function parseSession(raw) {
  const result = SessionSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Build a fresh default session for a new call.
 * @param {string} callSid
 * @returns {Session}
 */
export function defaultSession(callSid) {
  return SessionSchema.parse({ callSid });
}
