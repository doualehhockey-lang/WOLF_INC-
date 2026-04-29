// config/env.js — v2
// Source unique de vérité pour toutes les variables d'environnement.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Charge .env si présent (sans dépendance externe)
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

function optional(key, def = '') { return process.env[key] ?? def; }

export const config = {
  // ── Serveur ──────────────────────────────────────────────
  port:     parseInt(optional('PORT', '3000'), 10),
  baseUrl:  optional('BASE_URL', 'http://localhost:3000'),
  nodeEnv:  optional('NODE_ENV', 'development'),
  audioDir: optional('AUDIO_DIR', './public/audio'),

  // ── Twilio ───────────────────────────────────────────────
  twilio: {
    accountSid:  optional('TWILIO_ACCOUNT_SID'),
    authToken:   optional('TWILIO_AUTH_TOKEN'),
    phoneNumber: optional('TWILIO_PHONE_NUMBER'),
  },

  // ── Ollama / NLU ─────────────────────────────────────────
  ollama: {
    url:     optional('OLLAMA_URL',     'http://localhost:11434'),
    model:   optional('OLLAMA_MODEL',   'llama3.2:3b'),
    timeout: parseInt(optional('OLLAMA_TIMEOUT', '120000'), 10),
  },

  // ── STT ──────────────────────────────────────────────────
  stt: {
    // 'whisper' (défaut) | 'gather' (transcription Twilio native)
    mode:           optional('STT_MODE', 'whisper'),
    // Chemin vers audioProcessor.js de TERMINATOR v7
    // Ex: ./terminator/audioProcessor.js  ou  ../terminator-v7/src/audioProcessor.js
    terminatorPath: optional('TERMINATOR_PATH', ''),
  },

  // ── Whisper (moteur de transcription) ────────────────────
  whisper: {
    // 'local-server' → serveur whisper.cpp/faster-whisper sur votre machine (gratuit)
    // 'openai'       → API OpenAI Whisper (~$0.006/min)
    // 'mock'         → phrases de test, aucune vraie transcription
    backend:    optional('WHISPER_BACKEND',    'mock'),
    serverUrl:  optional('WHISPER_SERVER_URL', 'http://localhost:9000/transcribe'),
    openaiApiKey: optional('OPENAI_API_KEY',  ''),
    timeoutMs:  parseInt(optional('WHISPER_TIMEOUT', '15000'), 10),
  },

  // ── TTS ──────────────────────────────────────────────────
  tts: {
    // 'piper'       → local, gratuit, bonne qualité française (RECOMMANDÉ pour démarrer)
    // 'elevenlabs'  → qualité studio, payant
    // 'azure'       → 5h/mois gratuit
    // 'mock'        → WAV silencieux, tests uniquement
    provider: optional('TTS_PROVIDER', 'mock'),

    piper: {
      binary:    optional('PIPER_BINARY',     'piper'),           // commande shell
      modelPath: optional('PIPER_MODEL_PATH', ''),                // ex: ./models/fr_FR-upmc-medium.onnx
    },

    elevenlabs: {
      apiKey:  optional('ELEVENLABS_API_KEY'),
      voiceId: optional('ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM'),
    },

    azure: {
      key:    optional('AZURE_TTS_KEY'),
      region: optional('AZURE_TTS_REGION', 'eastus'),
      voice:  optional('AZURE_TTS_VOICE',  'fr-FR-DeniseNeural'),
    },
  },

  // ── Claude / NLU ─────────────────────────────────────────
  claude: {
    apiKey: optional('CLAUDE_API_KEY', ''),
    model:  optional('CLAUDE_MODEL', 'claude-haiku-4-5-20251001'),
    endpoint: optional('CLAUDE_ENDPOINT', 'https://api.anthropic.com/v1/complete'),
  },

  // ── Agent ────────────────────────────────────────────────
  agent: {
    eventsFile: optional('EVENTS_FILE', './data/events.json'),
    maxEvents:  parseInt(optional('MAX_EVENTS', '500'), 10),
  },

  // ── SMS Auto-répondeur ───────────────────────────────────
  // Tons disponibles : pro | sec | friendly | sarcastique | wolf-inc
  sms: {
    tone: optional('SMS_TONE', 'friendly'),
  },
};
