// @ts-nocheck
// tts.js — v3
// Synthèse vocale (TTS) — 4 providers + cache Redis (LRU) avec fallback Map.
//
// Providers : 'piper' | 'elevenlabs' | 'azure' | 'mock'

'use strict';

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { randomUUID, createHash } from 'crypto';
import { config } from './env.js';
import { childLogger } from './utils/logger.js';
import { redis, redisAvailable } from './utils/redis.js';
import { ttsCacheHits } from './utils/metrics.js';

const log = childLogger('tts');
const execFileAsync = promisify(execFile);

// ── In-memory fallback cache (when Redis unavailable) ─────────────────────────

const _memCache = new Map();
const MEM_CACHE_MAX = 100;

function _cacheKey(text, provider, locale = 'fr-FR') {
  return `tts:${provider}:${locale}:${createHash('md5').update(text).digest('hex')}`;
}

async function _cacheGet(text, provider, locale = 'fr-FR') {
  const key = _cacheKey(text, provider, locale);

  if (redisAvailable) {
    const raw = await redis.getBuffer(key).catch(() => null);
    if (raw) {
      await redis.expire(key, 86400).catch(() => {}); // LRU: reset TTL
      const meta = await redis.get(`${key}:meta`).catch(() => null);
      const { ext, mimeType } = meta ? JSON.parse(meta) : { ext: '.wav', mimeType: 'audio/wav' };
      ttsCacheHits.inc({ type: 'redis' });
      return { buffer: raw, ext, mimeType };
    }
    return null;
  }

  // In-memory fallback
  const cached = _memCache.get(key);
  if (cached) {
    ttsCacheHits.inc({ type: 'memory' });
    return cached;
  }
  return null;
}

async function _cacheSet(text, provider, result, locale = 'fr-FR') {
  const key = _cacheKey(text, provider, locale);

  if (redisAvailable) {
    await redis
      .setex(key, 86400, result.buffer)
      .catch(err => log.warn({ err: err.message }, 'Redis TTS cache write failed'));
    await redis
      .setex(`${key}:meta`, 86400, JSON.stringify({ ext: result.ext, mimeType: result.mimeType }))
      .catch(() => {});
    return;
  }

  // In-memory fallback: FIFO eviction
  if (_memCache.size >= MEM_CACHE_MAX) {
    _memCache.delete(_memCache.keys().next().value);
  }
  _memCache.set(key, result);
}

// ── Provider 1 — PIPER TTS (local, gratuit) ───────────────────────────────────

async function synthesizePiper(text) {
  const modelPath = config.tts.piper.modelPath;
  const piperBin = config.tts.piper.binary;
  if (!modelPath) throw new Error('TTS Piper: PIPER_MODEL_PATH manquant dans .env');

  const tmpDir = resolve('./tmp/tts');
  await mkdir(tmpDir, { recursive: true });
  const outFile = resolve(tmpDir, `${randomUUID()}.wav`);
  const inFile = resolve(tmpDir, `${randomUUID()}.txt`);
  await writeFile(inFile, text.slice(0, 1000), 'utf8');

  try {
    await execFileAsync(
      piperBin,
      ['--model', modelPath, '--output_file', outFile, '--input_file', inFile],
      { timeout: 30_000 }
    );
    return await readFile(outFile);
  } finally {
    unlink(outFile).catch(() => {});
    unlink(inFile).catch(() => {});
  }
}

// ── Provider 2 — ElevenLabs ───────────────────────────────────────────────────

async function synthesizeElevenLabs(text) {
  const { apiKey, voiceId } = config.tts.elevenlabs;
  if (!apiKey) throw new Error('TTS ElevenLabs: ELEVENLABS_API_KEY manquant');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${err}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── Provider 3 — Azure ────────────────────────────────────────────────────────

async function synthesizeAzure(text, locale = 'fr-FR') {
  const { key, region, voice } = config.tts.azure;
  if (!key) throw new Error('TTS Azure: AZURE_TTS_KEY manquant');

  const tokenRes = await fetch(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key },
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!tokenRes.ok) throw new Error(`Azure token ${tokenRes.status}`);
  const token = await tokenRes.text();

  const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${voice}'><prosody rate='0%'>${_escXml(text)}</prosody></voice></speak>`;
  const ttsRes = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      'User-Agent': 'wolf-engine/1.0',
    },
    body: ssml,
    signal: AbortSignal.timeout(20_000),
  });
  if (!ttsRes.ok) throw new Error(`Azure TTS ${ttsRes.status}`);
  return Buffer.from(await ttsRes.arrayBuffer());
}

// ── Provider 4 — Mock ─────────────────────────────────────────────────────────

function synthesizeMock(text) {
  log.debug({ text: text.slice(0, 60) }, 'TTS mock synthesis');
  const sr = 8000,
    dur = 1,
    data = Buffer.alloc(sr * 2 * dur, 0);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Promise.resolve(Buffer.concat([h, data]));
}

// ── API PUBLIQUE ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TtsResult
 * @property {Buffer}  buffer
 * @property {string}  ext
 * @property {string}  mimeType
 * @property {boolean} fallback
 */

/**
 * @param {string} text
 * @returns {Promise<TtsResult>}
 */
export async function synthesize(text, locale = 'fr-FR') {
  if (!text?.trim()) throw new Error('[TTS] Texte vide');

  const safeText = text.trim().slice(0, 500);
  const provider = config.tts.provider;

  const cached = await _cacheGet(safeText, provider, locale);
  if (cached) {
    log.debug(
      { provider, locale, cacheBackend: redisAvailable ? 'redis' : 'memory' },
      'TTS cache hit'
    );
    return { ...cached, fallback: false };
  }

  let buffer;
  let isAudioFmt = false;

  try {
    switch (provider) {
      case 'piper':
        buffer = await synthesizePiper(safeText);
        break;
      case 'elevenlabs':
        buffer = await synthesizeElevenLabs(safeText);
        isAudioFmt = true;
        break;
      case 'azure':
        buffer = await synthesizeAzure(safeText, locale);
        isAudioFmt = true;
        break;
      case 'mock':
      default:
        buffer = await synthesizeMock(safeText);
        break;
    }

    const result = {
      buffer,
      ext: isAudioFmt ? '.mp3' : '.wav',
      mimeType: isAudioFmt ? 'audio/mpeg' : 'audio/wav',
      fallback: false,
    };
    await _cacheSet(
      safeText,
      provider,
      { buffer, ext: result.ext, mimeType: result.mimeType },
      locale
    );
    return result;
  } catch (err) {
    log.error({ err: err.message, provider }, 'TTS synthesis failed');
    if (provider !== 'mock') {
      log.warn('Falling back to mock TTS');
      const buf = await synthesizeMock(safeText);
      return { buffer: buf, ext: '.wav', mimeType: 'audio/wav', fallback: true };
    }
    throw err;
  }
}

function _escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
