// @ts-nocheck
// src/core/config.js — Zod-validated configuration with crash-early on missing required vars.
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),

  // Security — required
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  API_KEYS: z.string().min(1),
  PHONE_SALT: z.string().min(16),

  // CORS
  CORS_ORIGINS: z.string().default(''),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_PHONE_NUMBER: z.string().default(''),

  // Ollama
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.2:3b'),
  OLLAMA_TIMEOUT: z.coerce.number().default(120000),

  // STT
  STT_MODE: z.string().default('gather'),
  TERMINATOR_PATH: z.string().default(''),

  // Whisper
  WHISPER_BACKEND: z.string().default('mock'),
  WHISPER_SERVER_URL: z.string().default('http://localhost:9000/transcribe'),
  OPENAI_API_KEY: z.string().default(''),
  WHISPER_TIMEOUT: z.coerce.number().default(15000),

  // TTS
  TTS_PROVIDER: z.string().default('mock'),
  PIPER_BINARY: z.string().default('piper'),
  PIPER_MODEL_PATH: z.string().default(''),
  ELEVENLABS_API_KEY: z.string().default(''),
  ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  AZURE_TTS_KEY: z.string().default(''),
  AZURE_TTS_REGION: z.string().default('eastus'),
  AZURE_TTS_VOICE: z.string().default('fr-FR-DeniseNeural'),

  // Claude
  CLAUDE_API_KEY: z.string().default(''),
  CLAUDE_MODEL: z.string().default('claude-haiku-4-5-20251001'),

  // Agent
  EVENTS_FILE: z.string().default('./data/events.json'),
  MAX_EVENTS: z.coerce.number().default(500),
  AUDIO_DIR: z.string().default('./public/audio'),

  // SMS
  SMS_TONE: z.string().default('friendly'),

  // Database
  DB_HOST: z.string().default(''),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('wolf_engine'),
  DB_SSL: z.string().default('false'),

  // Redis
  REDIS_URL: z.string().default(''),

  // OTEL
  OTEL_ENABLED: z.string().default('false'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
  throw new Error(`[config] Invalid environment variables:\n${missing}`);
}

const e = parsed.data;

export const config = {
  NODE_ENV: e.NODE_ENV,
  PORT: e.PORT,
  BASE_URL: e.BASE_URL,
  LOG_LEVEL: e.LOG_LEVEL,
  JWT_SECRET: e.JWT_SECRET,
  JWT_REFRESH_SECRET: e.JWT_REFRESH_SECRET,
  PHONE_SALT: e.PHONE_SALT,
  CORS_ORIGINS: e.CORS_ORIGINS,
  AUDIO_DIR: e.AUDIO_DIR,

  twilio: {
    accountSid: e.TWILIO_ACCOUNT_SID,
    authToken: e.TWILIO_AUTH_TOKEN,
    phoneNumber: e.TWILIO_PHONE_NUMBER,
  },

  ollama: {
    url: e.OLLAMA_URL,
    model: e.OLLAMA_MODEL,
    timeout: e.OLLAMA_TIMEOUT,
  },

  stt: {
    mode: e.STT_MODE,
    terminatorPath: e.TERMINATOR_PATH,
  },

  whisper: {
    backend: e.WHISPER_BACKEND,
    serverUrl: e.WHISPER_SERVER_URL,
    openaiApiKey: e.OPENAI_API_KEY,
    timeoutMs: e.WHISPER_TIMEOUT,
  },

  tts: {
    provider: e.TTS_PROVIDER,
    piper: { binary: e.PIPER_BINARY, modelPath: e.PIPER_MODEL_PATH },
    elevenlabs: { apiKey: e.ELEVENLABS_API_KEY, voiceId: e.ELEVENLABS_VOICE_ID },
    azure: { key: e.AZURE_TTS_KEY, region: e.AZURE_TTS_REGION, voice: e.AZURE_TTS_VOICE },
  },

  claude: {
    apiKey: e.CLAUDE_API_KEY,
    model: e.CLAUDE_MODEL,
  },

  agent: {
    eventsFile: e.EVENTS_FILE,
    maxEvents: e.MAX_EVENTS,
  },

  sms: { tone: e.SMS_TONE },

  db: {
    host: e.DB_HOST,
    port: e.DB_PORT,
    user: e.DB_USER,
    password: e.DB_PASSWORD,
    name: e.DB_NAME,
    ssl: e.DB_SSL === 'true',
  },

  redis: { url: e.REDIS_URL },

  otel: {
    enabled: e.OTEL_ENABLED !== 'false',
    endpoint: e.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
};

export const isProd = e.NODE_ENV === 'production';
export const isTest = e.NODE_ENV === 'test';
export const apiKeys = e.API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
export const corsOrigins = e.CORS_ORIGINS
  ? e.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];
