// src/features/tts/tts.service.js — TTS orchestrator.
// Selects provider from config.TTS_PROVIDER, checks cache, falls back to mock on error.
// Inflight dedup prevents parallel synthesis of identical text+locale pairs.

import { childLogger }                      from '../../core/logger.js';
import { config }                           from '../../core/config.js';
import { ttsLatency, inflightTts }          from '../../core/metrics.js';
import { TtsError }                         from '../../core/errors.js';
import { isEnabled, FLAGS }                 from '../../core/featureFlags.js';
import { cacheGet, cacheSet }               from './tts.cache.js';
import { synthesizeMock }                   from './providers/mock.js';

const log      = childLogger('tts');
/** @type {Map<string, Promise<TtsResult>>} */
const _inflight = new Map();

/**
 * @typedef {Object} TtsResult
 * @property {Buffer}  buffer
 * @property {string}  ext       — '.wav' | '.mp3'
 * @property {string}  mimeType  — 'audio/wav' | 'audio/mpeg'
 * @property {boolean} fallback  — true when mock was used as fallback
 */

/**
 * Synthesize text to audio.  Results are cached and inflight calls are deduped.
 * @param {string} text
 * @param {string} [locale]
 * @returns {Promise<TtsResult>}
 */
export async function synthesize(text, locale = 'fr-FR') {
  if (!text?.trim()) throw new TtsError('Empty text passed to synthesize()');

  const safeText = text.trim().slice(0, 500);
  const provider = config.TTS_PROVIDER;
  const key      = `${provider}:${locale}:${safeText}`;

  // 1. Inflight dedup — register BEFORE any async work so concurrent calls join
  if (_inflight.has(key)) {
    return _inflight.get(key);
  }

  // Wrap cache check + synthesis in one promise so both are covered by dedup
  const promise = (async () => {
    // 2. Cache check
    const cached = await cacheGet(safeText, provider, locale);
    if (cached) {
      log.debug({ provider, locale }, 'TTS cache hit');
      return { ...cached, fallback: false };
    }

    // 3. Synthesize
    return _synthesize(safeText, provider, locale);
  })();

  _inflight.set(key, promise);
  inflightTts.set(_inflight.size);

  try {
    return await promise;
  } finally {
    _inflight.delete(key);
    inflightTts.set(_inflight.size);
  }
}

async function _synthesize(text, provider, locale) {
  const timer = ttsLatency.startTimer({ provider });
  let   buffer;
  let   isAudio = false;

  try {
    // Resolve effective provider — kill switch forces mock when provider is disabled
    let effectiveProvider = provider;
    if (provider === 'elevenlabs' && !await isEnabled(FLAGS.TTS_ELEVENLABS)) {
      log.warn({ provider }, 'TTS_ELEVENLABS flag disabled — falling back to mock');
      effectiveProvider = 'mock';
    } else if (provider === 'azure' && !await isEnabled(FLAGS.TTS_AZURE)) {
      log.warn({ provider }, 'TTS_AZURE flag disabled — falling back to mock');
      effectiveProvider = 'mock';
    } else if (provider === 'piper' && !await isEnabled(FLAGS.TTS_PIPER)) {
      log.warn({ provider }, 'TTS_PIPER flag disabled — falling back to mock');
      effectiveProvider = 'mock';
    }

    switch (effectiveProvider) {
      case 'piper': {
        const { synthesizePiper } = await import('./providers/piper.js');
        buffer = await synthesizePiper(text);
        break;
      }
      case 'elevenlabs': {
        const { synthesizeElevenLabs } = await import('./providers/elevenlabs.js');
        buffer   = await synthesizeElevenLabs(text);
        isAudio  = true;
        break;
      }
      case 'azure': {
        const { synthesizeAzure } = await import('./providers/azure.js');
        buffer   = await synthesizeAzure(text, locale);
        isAudio  = true;
        break;
      }
      default: // 'mock'
        buffer = await synthesizeMock(text);
    }

    timer({ success: 'true' });
    const result = {
      buffer,
      ext:      isAudio ? '.mp3' : '.wav',
      mimeType: isAudio ? 'audio/mpeg' : 'audio/wav',
      fallback: false,
    };
    await cacheSet(text, provider, { buffer, ext: result.ext, mimeType: result.mimeType }, locale);
    return result;
  } catch (err) {
    timer({ success: 'false' });
    log.error({ err: err.message, provider }, 'TTS synthesis failed');

    if (provider !== 'mock') {
      log.warn('Falling back to mock TTS');
      const buf = await synthesizeMock(text);
      return { buffer: buf, ext: '.wav', mimeType: 'audio/wav', fallback: true };
    }
    throw err;
  }
}
