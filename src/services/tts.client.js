// src/services/tts.client.js — Cloud TTS client with circuit breaker + retry.
//
// Cloud backends (circuit-breaker protected):
//   'elevenlabs' — ElevenLabs API (single HTTP call → MP3)
//   'azure'      — Azure Cognitive Services (2-step: token + SSML synthesis → MP3)
//
// Local backends (bypass circuit breaker — no network dependency):
//   'piper'      — Local Piper binary (WAV)
//   'mock'       — Silent WAV buffer (dev / test)

import { childLogger } from '../core/logger.js';
import { config } from '../core/config.js';
import { apiFetch } from '../infra/http/httpClient.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  HttpError,
  withRetry,
} from './circuitBreaker.js';
import { recordRequest, recordFailure, recordLatency, setCircuitState } from './metrics.js';

const log = childLogger('tts');

// ── XML escaping (Azure SSML) ─────────────────────────────────────────────────

function _escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Cloud backends ────────────────────────────────────────────────────────────

/**
 * ElevenLabs TTS — single POST, returns MP3.
 * @param {string}      text
 * @param {AbortSignal} signal  From circuit breaker's AbortController.
 * @returns {Promise<{buffer:Buffer,ext:string,mimeType:string}>}
 */
async function _elevenlabs(text, signal) {
  const { ELEVENLABS_API_KEY: apiKey, ELEVENLABS_VOICE_ID: voiceId } = config;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  const res = await apiFetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
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
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new HttpError(res.status, `ElevenLabs ${res.status}: ${detail.slice(0, 200)}`);
  }

  return { buffer: Buffer.from(await res.arrayBuffer()), ext: '.mp3', mimeType: 'audio/mpeg' };
}

/**
 * Azure Cognitive Services TTS — token exchange then SSML synthesis, returns MP3.
 * Both HTTP requests share the same AbortSignal so timeout aborts the whole flow.
 * @param {string}      text
 * @param {string}      locale  e.g. 'fr-FR'
 * @param {AbortSignal} signal
 * @returns {Promise<{buffer:Buffer,ext:string,mimeType:string}>}
 */
async function _azure(text, locale, signal) {
  const { AZURE_TTS_KEY: key, AZURE_TTS_REGION: region, AZURE_TTS_VOICE: voice } = config;
  if (!key) throw new Error('AZURE_TTS_KEY not configured');

  // Step 1 — bearer token
  const tokenRes = await apiFetch(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key }, signal }
  );
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '');
    throw new HttpError(tokenRes.status, `Azure token ${tokenRes.status}: ${detail.slice(0, 200)}`);
  }
  const token = await tokenRes.text();

  // Step 2 — SSML synthesis
  const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${voice}'><prosody rate='0%'>${_escXml(text)}</prosody></voice></speak>`;
  const ttsRes = await apiFetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      'User-Agent': 'wolf-engine/2.0',
    },
    body: ssml,
    signal,
  });
  if (!ttsRes.ok) {
    const detail = await ttsRes.text().catch(() => '');
    throw new HttpError(ttsRes.status, `Azure TTS ${ttsRes.status}: ${detail.slice(0, 200)}`);
  }

  return { buffer: Buffer.from(await ttsRes.arrayBuffer()), ext: '.mp3', mimeType: 'audio/mpeg' };
}

// ── Error classification ──────────────────────────────────────────────────────

function _isRetryable(err) {
  if (err instanceof CircuitOpenError) return false;
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) return false;
  return true;
}

function _requestStatus(err) {
  if (err instanceof CircuitOpenError) return 'circuit_open';
  if (err instanceof TimeoutError) return 'timeout';
  return 'error';
}

function _failureReason(err) {
  if (err instanceof CircuitOpenError) return 'circuit_open';
  if (err instanceof TimeoutError) return 'timeout';
  if (err instanceof HttpError) return err.status >= 500 ? 'http_5xx' : 'http_4xx';
  return 'network';
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TtsResult
 * @property {Buffer} buffer
 * @property {string} ext       '.wav' | '.mp3'
 * @property {string} mimeType  'audio/wav' | 'audio/mpeg'
 */

/**
 * Create a `synthesize` function bound to a specific CircuitBreaker instance.
 *
 * Exported for testing — production code should use the default `synthesize` export.
 *
 * @param {CircuitBreaker} breaker
 * @param {object}         [retryOpts]              Forwarded to withRetry (override for tests).
 * @param {number}         [retryOpts.maxRetries=2]
 * @param {number}         [retryOpts.baseMs=200]
 * @param {number}         [retryOpts.maxMs=2000]
 * @returns {function(string, object?): Promise<TtsResult>}
 */
export function _makeSynthesize(breaker, retryOpts = {}) {
  const { maxRetries = 2, baseMs = 200, maxMs = 2_000 } = retryOpts;

  setCircuitState(breaker.name, breaker.getState());

  /**
   * Synthesize text to an audio buffer.
   *
   * Local providers (mock, piper) bypass the circuit breaker.
   * Cloud providers (elevenlabs, azure) go through it.
   *
   * @param {string} text
   * @param {object} [opts]
   * @param {string} [opts.requestId='']
   * @param {string} [opts.locale='fr-FR']    Passed to Azure SSML.
   * @param {number} [opts.timeoutMs=15000]   Per-call deadline (AbortController).
   * @returns {Promise<TtsResult>}
   * @throws {CircuitOpenError}  When breaker is OPEN and timer has not expired.
   * @throws {TimeoutError}      When the backend does not respond in time.
   * @throws {HttpError}         On non-retryable HTTP errors (4xx).
   */
  return async function synthesize(text, opts = {}) {
    if (!text?.trim()) throw new Error('[TTS] Empty text passed to synthesize()');

    const { requestId = '', locale = 'fr-FR', timeoutMs = 15_000 } = opts;

    const provider = config.TTS_PROVIDER ?? 'mock';

    // ── Local backends — bypass circuit breaker ──────────────────────────────
    if (provider === 'mock') {
      const { synthesizeMock } = await import('../features/tts/providers/mock.js');
      const buf = await synthesizeMock(text);
      return { buffer: buf, ext: '.wav', mimeType: 'audio/wav' };
    }
    if (provider === 'piper') {
      const { synthesizePiper } = await import('../features/tts/providers/piper.js');
      const buf = await synthesizePiper(text);
      return { buffer: buf, ext: '.wav', mimeType: 'audio/wav' };
    }

    // ── Cloud backends — through circuit breaker ─────────────────────────────
    const backendFn =
      provider === 'azure'
        ? signal => _azure(text, locale, signal)
        : signal => _elevenlabs(text, signal); // default: elevenlabs

    const start = Date.now();
    let attempts = 0;

    try {
      const result = await withRetry(
        () => {
          attempts++;
          return breaker.exec(backendFn, { requestId, timeoutMs });
        },
        { maxRetries, baseMs, maxMs, shouldRetry: _isRetryable }
      );

      const latency = Date.now() - start;
      recordRequest('tts', 'success');
      recordLatency('tts', latency);
      log.debug(
        { requestId, provider, locale, latency, attempts, state: breaker.getState() },
        'TTS OK'
      );
      return result;
    } catch (err) {
      const latency = Date.now() - start;
      recordRequest('tts', _requestStatus(err));
      recordFailure('tts', _failureReason(err));
      recordLatency('tts', latency);
      log.warn(
        {
          requestId,
          provider,
          locale,
          latency,
          attempts,
          state: breaker.getState(),
          err: err.message,
        },
        'TTS failed'
      );
      throw err;
    }
  };
}

// ── Default production instance ───────────────────────────────────────────────

const _defaultBreaker = new CircuitBreaker('tts', {
  failureThreshold: 5,
  errorRateThreshold: 0.5,
  minCalls: 10,
  windowMs: 60_000,
  openDurationMs: 60_000,
  onStateChange(state, name) {
    log.warn({ provider: name, state }, `Circuit breaker → ${state}`);
    setCircuitState(name, state);
  },
});

/** Production synthesis function — use this in application code. */
export const synthesize = _makeSynthesize(_defaultBreaker);
