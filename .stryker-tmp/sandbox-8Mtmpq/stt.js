// @ts-nocheck
// stt.js — v2
// Adaptateur STT : TERMINATOR v7 (DSP audio) + Whisper (transcription).
// TERMINATOR = processeur DSP (bruit, resampling, µ-law)
// Whisper    = moteur de reconnaissance vocale

'use strict';

import { config } from './env.js';
import { mulawToWav, pcm16ToWav } from './utils/audio.js';
import { transcribeWav } from './whisper.js';
import { childLogger } from './utils/logger.js';

const log = childLogger('stt');

// ── TERMINATOR v7 — Chargement dynamique ─────────────────────────────────────

let _terminatorModule = null;

async function loadTerminator() {
  if (_terminatorModule !== null) return _terminatorModule;

  const candidates = [
    config.stt.terminatorPath,
    './terminator/audioProcessor.js',
    '../terminator/audioProcessor.js',
    '../../terminator/audioProcessor.js',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      const Cls = mod.default ?? mod.AudioProcessor;
      if (typeof Cls === 'function') {
        _terminatorModule = Cls;
        log.info({ candidate }, 'TERMINATOR v7 loaded');
        return _terminatorModule;
      }
    } catch {
      /* try next candidate */
    }
  }

  log.warn('TERMINATOR v7 not found — using basic audio conversion');
  _terminatorModule = false;
  return null;
}

// ── Préparation audio avec TERMINATOR v7 ─────────────────────────────────────

async function prepareAudioWithTerminator(rawBuf, format) {
  const AudioProcessor = await loadTerminator();

  if (!AudioProcessor) {
    return format === 'mulaw' ? mulawToWav(rawBuf) : rawBuf;
  }

  const muLawBuf = format === 'mulaw' ? rawBuf : _wavToMulaw(rawBuf);

  return new Promise((resolve, _reject) => {
    const chunks = [];
    let totalBytes = 0;
    let processed = 0;

    const processor = new AudioProcessor('twilio-realtime', {
      resamplerMode: 'high-quality',
      decodeMode: 'tolerant',
      dropSilence: false,
      flushIntervalMs: 0,
      onChunk: pcm16kBuf => {
        chunks.push(Buffer.from(pcm16kBuf));
        totalBytes += pcm16kBuf.length;
      },
    });

    const PACKET_SIZE = 160;
    for (let offset = 0; offset < muLawBuf.length; offset += PACKET_SIZE) {
      const packet = muLawBuf.slice(offset, Math.min(offset + PACKET_SIZE, muLawBuf.length));
      const result = processor.process(packet.toString('base64'));
      if (!result.ok && result.reason !== 'heartbeat' && result.reason !== 'silence') {
        log.warn({ reason: result.reason }, 'TERMINATOR packet warning');
      }
      processed++;
    }

    processor.flush();

    if (!chunks.length || totalBytes === 0) {
      log.warn('TERMINATOR produced no chunks — falling back to basic conversion');
      return resolve(format === 'mulaw' ? mulawToWav(rawBuf) : rawBuf);
    }

    const pcm16 = Buffer.concat(chunks);
    const wav = pcm16ToWav(pcm16, 16000);
    log.debug(
      { processed, durationS: (totalBytes / 2 / 16000).toFixed(2) },
      'TERMINATOR processed audio'
    );
    resolve(wav);
  });
}

function _wavToMulaw(wavBuf) {
  if (wavBuf.slice(0, 4).toString() === 'RIFF') return wavBuf.slice(44);
  return wavBuf;
}

// ── API PUBLIQUE ──────────────────────────────────────────────────────────────

/**
 * Transcrit un buffer audio en texte.
 * @param {Buffer}         audioBuffer
 * @param {'mulaw'|'wav'}  format
 * @returns {Promise<string>}
 */
export async function transcribe(audioBuffer, format = 'wav') {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new Error('[STT] Buffer audio vide ou invalide');
  }

  const start = Date.now();

  let wavBuf;
  try {
    wavBuf = await prepareAudioWithTerminator(audioBuffer, format);
    log.debug({ bytes: wavBuf.length, ms: Date.now() - start }, 'Audio prepared');
  } catch (err) {
    log.error({ err: err.message }, 'Audio preparation failed — using basic conversion');
    wavBuf = format === 'mulaw' ? mulawToWav(audioBuffer) : audioBuffer;
  }

  const t1 = Date.now();
  const text = await transcribeWav(wavBuf);
  log.info(
    { text: text.slice(0, 80), prepMs: t1 - start, transcribeMs: Date.now() - t1 },
    'STT complete'
  );

  return text;
}
