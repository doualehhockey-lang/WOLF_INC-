// @ts-nocheck
// src/services/whisper.js
// Adaptateur Whisper — transcription audio → texte.
//
// TERMINATOR v7 gère le DSP (mulaw→PCM16 propre à 16kHz).
// Ce module gère la transcription (speech → text) via 3 backends :
//
//   'local-server' : Serveur Whisper local (whisper.cpp / faster-whisper)
//                    POST http://localhost:9000/transcribe → { text }
//                    Gratuit, zéro latence réseau, meilleure vie privée.
//
//   'openai'       : API OpenAI Whisper (gpt-whisper-1)
//                    ~$0.006/min, très bonne qualité française.
//                    Nécessite OPENAI_API_KEY.
//
//   'mock'         : Retourne une phrase fixe (développement/tests).

'use strict';

import { writeFile, unlink, mkdir } from 'fs/promises';
import { resolve }                  from 'path';
import { randomUUID }               from 'crypto';
import { config }                   from './env.js';

// ═══════════════════════════════════════════════════════════
// BACKEND 1 — Serveur Whisper local
// ═══════════════════════════════════════════════════════════
//
// Comment lancer un serveur Whisper local :
//
// Option A — whisper.cpp (le plus rapide, C++) :
//   git clone https://github.com/ggerganov/whisper.cpp
//   make
//   ./server -m models/ggml-small.bin -l fr --port 9000
//
// Option B — faster-whisper (Python, GPU si dispo) :
//   pip install faster-whisper flask
//   # Lancer le serveur inclus dans ce projet :
//   node scripts/start-whisper-server.js
//
// Option C — wyoming-whisper (pour Home Assistant / standalone) :
//   pip install wyoming-faster-whisper
//   python -m wyoming_faster_whisper --uri tcp://0.0.0.0:10300

async function transcribeLocalServer(wavBuffer) {
  const url = config.whisper.serverUrl;

  // Crée un FormData avec le fichier WAV
  const boundary = `----FormBoundary${randomUUID().replace(/-/g, '')}`;
  const filename  = `audio_${Date.now()}.wav`;

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    ),
    wavBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    body,
    signal: AbortSignal.timeout(config.whisper.timeoutMs),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Whisper local server ${res.status}: ${err}`);
  }

  const json = await res.json();

  // Supporte plusieurs formats de réponse (whisper.cpp, faster-whisper, etc.)
  const text = json.text ?? json.transcription ?? json.result ?? json.transcript ?? '';
  if (!text.trim()) throw new Error('Whisper local server: réponse vide');

  return text.trim();
}

// ═══════════════════════════════════════════════════════════
// BACKEND 2 — OpenAI Whisper API
// ═══════════════════════════════════════════════════════════

async function transcribeOpenAI(wavBuffer) {
  const apiKey = config.whisper.openaiApiKey;
  if (!apiKey) throw new Error('Whisper OpenAI: OPENAI_API_KEY manquant dans .env');

  const boundary = `----FormBoundary${randomUUID().replace(/-/g, '')}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    ),
    wavBuffer,
    Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `fr\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `json\r\n` +
      `--${boundary}--\r\n`
    ),
  ]);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  `multipart/form-data; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`OpenAI Whisper ${res.status}: ${err}`);
  }

  const json = await res.json();
  if (!json.text?.trim()) throw new Error('OpenAI Whisper: réponse vide');
  return json.text.trim();
}

// ═══════════════════════════════════════════════════════════
// BACKEND 3 — Mock
// ═══════════════════════════════════════════════════════════

const MOCK_PHRASES = [
  "j'ai un rendez-vous demain à quatorze heures trente",
  "annule mon rendez-vous de mercredi",
  "quels sont mes rendez-vous de la semaine",
  "réunion avec Jean lundi prochain à neuf heures",
  "déplace mon meeting de vendredi à quinze heures",
];
let _mockIdx = 0;

async function transcribeMock(buf) {
  const phrase = MOCK_PHRASES[_mockIdx % MOCK_PHRASES.length];
  _mockIdx++;
  console.log(`[Whisper Mock] → "${phrase}"`);
  return phrase;
}

// ═══════════════════════════════════════════════════════════
// API PUBLIQUE
// ═══════════════════════════════════════════════════════════

/**
 * Transcrit un buffer WAV en texte.
 * Le buffer doit être un WAV propre (PCM16 16kHz) — TERMINATOR s'en charge en amont.
 *
 * @param {Buffer} wavBuffer
 * @returns {Promise<string>}
 */
export async function transcribeWav(wavBuffer) {
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44) {
    throw new Error('[Whisper] Buffer WAV invalide ou trop court');
  }

  const backend = config.whisper.backend;

  try {
    switch (backend) {
      case 'local-server': return await transcribeLocalServer(wavBuffer);
      case 'openai':       return await transcribeOpenAI(wavBuffer);
      case 'mock':
      default:             return await transcribeMock(wavBuffer);
    }
  } catch (err) {
    console.error(`[Whisper] Erreur (backend: ${backend}):`, err.message);

    // Fallback automatique sur mock si le backend réel échoue
    if (backend !== 'mock') {
      console.warn('[Whisper] → Fallback sur mock');
      return transcribeMock(wavBuffer);
    }
    throw err;
  }
}
