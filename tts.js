// src/services/tts.js — v2
// Synthèse vocale (TTS) — 4 providers.
//
// Providers disponibles :
//   'piper'       : Local, GRATUIT, bonne qualité française (recommandé sans clé API)
//   'elevenlabs'  : Qualité studio, ~$0.18/1000 chars (ElevenLabs API)
//   'azure'       : Bonne qualité, 5h/mois gratuit (Azure Cognitive Services)
//   'mock'        : WAV silencieux, pour les tests
//
// Recommandation : commencez par 'piper' (gratuit, local, voix française correcte)
// puis passez à 'elevenlabs' quand vous avez une clé API.

'use strict';

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { config }  from './env.js';

const execFileAsync = promisify(execFile);

// ═══════════════════════════════════════════════════════════
// PROVIDER 1 — PIPER TTS (local, gratuit)
// ═══════════════════════════════════════════════════════════
//
// Installation :
//   # Linux/macOS
//   pip install piper-tts
//   # Télécharger le modèle français :
//   piper --download-dir models --download fr_FR-upmc-medium
//
// Ou via binaire précompilé :
//   https://github.com/rhasspy/piper/releases
//   Télécharger piper + fr_FR-upmc-medium.onnx + fr_FR-upmc-medium.onnx.json

async function synthesizePiper(text) {
  const modelPath = config.tts.piper.modelPath;
  const piperBin  = config.tts.piper.binary;

  if (!modelPath) throw new Error('TTS Piper: PIPER_MODEL_PATH manquant dans .env');

  const tmpDir  = resolve('./tmp/tts');
  await mkdir(tmpDir, { recursive: true });
  const outFile = resolve(tmpDir, `${randomUUID()}.wav`);

  // Pas d'interpolation shell — texte passé via stdin, args comme tableau
  const inFile = resolve(tmpDir, `${randomUUID()}.txt`);
  await writeFile(inFile, text.slice(0, 1000), 'utf8');

  try {
    await execFileAsync(piperBin, [
      '--model', modelPath,
      '--output_file', outFile,
      '--input_file', inFile,
    ], { timeout: 30_000 });
    const buf = await readFile(outFile);
    return buf;
  } finally {
    unlink(outFile).catch(() => {});
    unlink(inFile).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// PROVIDER 2 — ELEVENLABS
// ═══════════════════════════════════════════════════════════

async function synthesizeElevenLabs(text) {
  const { apiKey, voiceId } = config.tts.elevenlabs;
  if (!apiKey) throw new Error('TTS ElevenLabs: ELEVENLABS_API_KEY manquant');

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method:  'POST',
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability:         0.5,
          similarity_boost:  0.75,
          style:             0.0,
          use_speaker_boost: true,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${err}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ═══════════════════════════════════════════════════════════
// PROVIDER 3 — AZURE COGNITIVE SERVICES
// ═══════════════════════════════════════════════════════════
// Compte gratuit : 5h audio/mois → suffisant pour une démo

async function synthesizeAzure(text) {
  const { key, region, voice } = config.tts.azure;
  if (!key) throw new Error('TTS Azure: AZURE_TTS_KEY manquant');

  // Token
  const tokenRes = await fetch(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method:  'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key },
      signal:  AbortSignal.timeout(10_000),
    }
  );
  if (!tokenRes.ok) throw new Error(`Azure token ${tokenRes.status}`);
  const token = await tokenRes.text();

  // SSML
  const ssml = `<speak version='1.0' xml:lang='fr-FR'>
  <voice name='${voice}'><prosody rate='0%'>${_escXml(text)}</prosody></voice>
</speak>`;

  const ttsRes = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method:  'POST',
      headers: {
        'Authorization':             `Bearer ${token}`,
        'Content-Type':              'application/ssml+xml',
        'X-Microsoft-OutputFormat':  'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent':                'voice-agent/1.0',
      },
      body:   ssml,
      signal: AbortSignal.timeout(20_000),
    }
  );

  if (!ttsRes.ok) throw new Error(`Azure TTS ${ttsRes.status}`);
  return Buffer.from(await ttsRes.arrayBuffer());
}

// ═══════════════════════════════════════════════════════════
// PROVIDER 4 — MOCK (WAV silencieux 1 seconde)
// ═══════════════════════════════════════════════════════════

function synthesizeMock(text) {
  console.log(`[TTS Mock] "${text.slice(0, 60)}..."`);
  const sr = 8000, dur = 1, data = Buffer.alloc(sr * 2 * dur, 0);
  const h  = Buffer.alloc(44);
  h.write('RIFF', 0);           h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);           h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);      h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);       h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);      h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Promise.resolve(Buffer.concat([h, data]));
}

// ═══════════════════════════════════════════════════════════
// API PUBLIQUE
// ═══════════════════════════════════════════════════════════

/**
 * @typedef {Object} TtsResult
 * @property {Buffer}  buffer
 * @property {string}  ext       - '.wav' | '.mp3'
 * @property {string}  mimeType
 * @property {boolean} fallback  - true si fallback sur mock
 */

/**
 * Synthétise un texte en audio.
 * @param {string} text
 * @returns {Promise<TtsResult>}
 */
export async function synthesize(text) {
  if (!text?.trim()) throw new Error('[TTS] Texte vide');

  // Tronque à 500 chars (les réponses agents sont courtes, Twilio a une limite)
  const safeText = text.trim().slice(0, 500);
  const provider = config.tts.provider;

  let buffer;
  let isAudioFmt = false; // true si MP3, false si WAV

  try {
    switch (provider) {
      case 'piper':
        buffer     = await synthesizePiper(safeText);
        isAudioFmt = false;
        break;
      case 'elevenlabs':
        buffer     = await synthesizeElevenLabs(safeText);
        isAudioFmt = true;
        break;
      case 'azure':
        buffer     = await synthesizeAzure(safeText);
        isAudioFmt = true;
        break;
      case 'mock':
      default:
        buffer     = await synthesizeMock(safeText);
        isAudioFmt = false;
        break;
    }

    return {
      buffer,
      ext:      isAudioFmt ? '.mp3' : '.wav',
      mimeType: isAudioFmt ? 'audio/mpeg' : 'audio/wav',
      fallback: false,
    };

  } catch (err) {
    console.error(`[TTS] Erreur provider "${provider}":`, err.message);

    if (provider !== 'mock') {
      console.warn('[TTS] → Fallback sur mock');
      const buf = await synthesizeMock(safeText);
      return { buffer: buf, ext: '.wav', mimeType: 'audio/wav', fallback: true };
    }
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
