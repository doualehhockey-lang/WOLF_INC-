// @ts-nocheck
// src/core/config.js — Application configuration with Zod validation.
// Crashes immediately on startup if any required variable is missing or invalid.
// Import this module first; never import env.js in new code.

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  // ── Server
  NODE_ENV:  z.enum(['development', 'test', 'production']).default('development'),
  PORT:      z.coerce.number().int().min(1).max(65535).default(3000),
  BASE_URL:  z.string().url('BASE_URL must be a valid URL (e.g. http://localhost:3000)'),
  AUDIO_DIR: z.string().default('./public/audio'),

  // ── Security — ALL required, validated at boot
  PHONE_SALT:         z.string().min(16, 'PHONE_SALT must be ≥ 16 characters'),
  JWT_SECRET:         z.string().min(32, 'JWT_SECRET must be ≥ 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be ≥ 32 characters'),
  API_KEYS:           z.string().min(1,  'API_KEYS must contain at least one key'),
  CORS_ORIGINS:       z.string().default('http://localhost:3000'),

  // ── Twilio (optional — app runs without it in dev)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN:  z.string().optional(),
  TWILIO_PHONE:       z.string().optional(),

  // ── PostgreSQL (optional — falls back to JSON store)
  DB_HOST:     z.string().optional(),
  DB_PORT:     z.coerce.number().default(5432),
  DB_USER:     z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME:     z.string().optional(),

  // ── Redis (optional — falls back to in-memory)
  REDIS_URL: z.string().url().optional(),

  // ── Ollama / NLU
  OLLAMA_URL:     z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL:   z.string().default('llama3.2:3b'),
  OLLAMA_TIMEOUT: z.coerce.number().default(120_000),

  // ── TTS
  TTS_PROVIDER:        z.enum(['piper', 'elevenlabs', 'azure', 'mock']).default('mock'),
  PIPER_BINARY:        z.string().default('piper'),
  PIPER_MODEL_PATH:    z.string().optional(),
  ELEVENLABS_API_KEY:  z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  AZURE_TTS_KEY:       z.string().optional(),
  AZURE_TTS_REGION:    z.string().default('eastus'),
  AZURE_TTS_VOICE:     z.string().default('fr-FR-DeniseNeural'),

  // ── STT / Whisper
  WHISPER_BACKEND:    z.enum(['local-server', 'openai', 'mock']).default('mock'),
  WHISPER_SERVER_URL: z.string().url().default('http://localhost:9000/transcribe'),
  OPENAI_API_KEY:     z.string().optional(),
  WHISPER_TIMEOUT:    z.coerce.number().default(15_000),

  // ── Claude
  CLAUDE_API_KEY: z.string().optional(),
  CLAUDE_MODEL:   z.string().default('claude-haiku-4-5-20251001'),

  // ── Agent
  EVENTS_FILE: z.string().default('./data/events.json'),
  MAX_EVENTS:  z.coerce.number().default(500),
  SMS_TONE:    z.enum(['pro', 'sec', 'friendly', 'sarcastique', 'wolf-inc']).default('friendly'),

  // ── OpenTelemetry
  OTEL_ENABLED:  z.string().transform(v => v === 'true').default('false'),
  OTEL_ENDPOINT: z.string().url().optional(),
});

// Throws ZodError on startup if any required variable is missing or invalid.
// This is intentional: fail fast rather than silently misbehave.
export const config = schema.parse(process.env);

// ── Derived helpers (computed once at startup) ────────────────────────────────

export const isProd      = config.NODE_ENV === 'production';
export const isTest      = config.NODE_ENV === 'test';
export const apiKeys     = config.API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
export const corsOrigins = config.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
