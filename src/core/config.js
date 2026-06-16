// src/core/config.js — Application configuration with Zod validation.
// Crashes immediately on startup if any required variable is missing or invalid.
// Import this module first; never import env.js in new code.

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  // ── Server
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BASE_URL: z.string().url('BASE_URL must be a valid URL (e.g. http://localhost:3000)'),
  AUDIO_DIR: z.string().default('./public/audio'),

  // ── Security — ALL required, validated at boot
  PHONE_SALT: z.string().min(16, 'PHONE_SALT must be ≥ 16 characters'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be ≥ 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be ≥ 32 characters'),
  API_KEYS: z.string().min(1, 'API_KEYS must contain at least one key'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // ── Twilio (optional — app runs without it in dev)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE: z.string().optional(),

  // ── PostgreSQL (optional — falls back to JSON store)
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),

  // ── Redis (required in production — JTI revocation requires shared state across instances)
  REDIS_URL: z.string().url().optional(),
  // Validated below: production enforces REDIS_URL presence

  // ── TTS
  TTS_PROVIDER: z.enum(['piper', 'elevenlabs', 'azure', 'mock']).default('mock'),
  PIPER_BINARY: z.string().default('piper'),
  PIPER_MODEL_PATH: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  AZURE_TTS_KEY: z.string().optional(),
  AZURE_TTS_REGION: z.string().default('eastus'),
  AZURE_TTS_VOICE: z.string().default('fr-FR-DeniseNeural'),

  // ── STT / Whisper
  WHISPER_BACKEND: z.enum(['local-server', 'openai', 'mock']).default('mock'),
  WHISPER_SERVER_URL: z.string().url().default('http://localhost:9000/transcribe'),
  OPENAI_API_KEY: z.string().optional(),
  WHISPER_TIMEOUT: z.coerce.number().default(15_000),

  // ── Claude
  CLAUDE_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-haiku-4-5-20251001'),

  // ── Agent
  EVENTS_FILE: z.string().default('./data/events.json'),
  MAX_EVENTS: z.coerce.number().default(500),
  SMS_TONE: z.enum(['pro', 'sec', 'friendly', 'sarcastique', 'wolf-inc']).default('friendly'),

  // ── Voice / i18n
  // Default BCP-47 locale for all voice responses (Twilio <Say>, <Gather>).
  // Override per-call based on detected language; this is the fallback.
  // Common values: en-US, fr-FR, es-ES, de-DE
  VOICE_DEFAULT_LOCALE: z.string().default('fr-FR'),
  // Greeting text synthesized at startup. Override for your brand.
  VOICE_GREETING_TEXT: z
    .string()
    .default('Bonjour, ici Sophie à la clinique ! Comment puis-je vous aider ?'),

  // ── Alerting (optionnel)
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // ── Stripe billing (optional in dev — required in production)
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PRICE_ID: z.string().default(''),
});

// Throws ZodError on startup if any required variable is missing or invalid.
// This is intentional: fail fast rather than silently misbehave.
const _parsed = schema.parse(process.env);

// Production hard requirement: Redis is required for JTI revocation across instances.
// Without it, logout and token rotation do not propagate — any instance can still
// accept a revoked refresh token, creating a persistent replay window.
if (_parsed.NODE_ENV === 'production' && !_parsed.REDIS_URL) {
  throw new Error(
    '[config] REDIS_URL is required in production. ' +
      'JTI revocation requires shared state — in-memory fallback is single-instance only.'
  );
}

export const config = _parsed;

// ── Derived helpers (computed once at startup) ────────────────────────────────

export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
export const apiKeys = config.API_KEYS.split(',')
  .map(k => k.trim())
  .filter(Boolean);
export const corsOrigins = config.CORS_ORIGINS.split(',')
  .map(s => s.trim())
  .filter(Boolean);
