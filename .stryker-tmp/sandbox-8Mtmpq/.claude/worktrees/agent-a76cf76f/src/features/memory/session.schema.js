// @ts-nocheck
// src/features/memory/session.schema.js — Zod schema for conversation session validation.
import { z } from 'zod';

const TurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(2000),
  ts: z.number().optional(),
  nlu: z.record(z.unknown()).optional(),
});

export const SessionSchema = z.object({
  turns: z.array(TurnSchema).max(10).default([]),
  lang: z.string().length(2).default('fr'),
  pendingEntities: z.record(z.unknown()).optional(),
  createdAt: z.number().default(() => Date.now()),
});

export function parseSession(raw) {
  if (!raw) return SessionSchema.parse({});
  try {
    const r = SessionSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : SessionSchema.parse({});
  } catch {
    return SessionSchema.parse({});
  }
}
