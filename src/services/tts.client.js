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
<<<<<<< HEAD
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
=======
import { config }      from '../core/config.js';
import { apiFetch }    from '../infra/http/httpClient.js';
import {
  CircuitBreaker, CircuitOpenError, TimeoutError, HttpError, withRetry,
} from './circuitBreaker.js';
import {
  recordRequest, recordFailure, recordLatency, setCircuitState,
} from './metrics.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

const log = childLogger('tts');

// ── XML escaping (Azure SSML) ─────────────────────────────────────────────────

function _escXml(s) {
  return String(s)
<<<<<<< HEAD
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
=======
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
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
=======
    method:  'POST',
    headers: {
      'xi-api-key':   apiKey,
      'Content-Type': 'application/json',
      Accept:         'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id:       'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
    { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key }, signal }
=======
    { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key }, signal },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  );
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '');
    throw new HttpError(tokenRes.status, `Azure token ${tokenRes.status}: ${detail.slice(0, 200)}`);
  }
  const token = await tokenRes.text();

  // Step 2 — SSML synthesis
  const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${voice}'><prosody rate='0%'>${_escXml(text)}</prosody></voice></speak>`;
<<<<<<< HEAD
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
=======
  const ttsRes = await apiFetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method:  'POST',
      headers: {
        Authorization:              `Bearer ${token}`,
        'Content-Type':             'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent':               'wolf-engine/2.0',
      },
      body:   ssml,
      signal,
    },
  );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
  if (err instanceof TimeoutError) return 'timeout';
=======
  if (err instanceof TimeoutError)     return 'timeout';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return 'error';
}

function _failureReason(err) {
  if (err instanceof CircuitOpenError) return 'circuit_open';
<<<<<<< HEAD
  if (err instanceof TimeoutError) return 'timeout';
  if (err instanceof HttpError) return err.status >= 500 ? 'http_5xx' : 'http_4xx';
=======
  if (err instanceof TimeoutError)     return 'timeout';
  if (err instanceof HttpError)        return err.status >= 500 ? 'http_5xx' : 'http_4xx';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
  const { maxRetries = 2, baseMs = 200, maxMs = 2_000 } = retryOpts;
=======
  const {
    maxRetries = 2,
    baseMs     = 200,
    maxMs      = 2_000,
  } = retryOpts;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

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

<<<<<<< HEAD
    const { requestId = '', locale = 'fr-FR', timeoutMs = 15_000 } = opts;
=======
    const {
      requestId = '',
      locale    = 'fr-FR',
      timeoutMs = 15_000,
    } = opts;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

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
<<<<<<< HEAD
    const backendFn =
      provider === 'azure'
        ? signal => _azure(text, locale, signal)
        : signal => _elevenlabs(text, signal); // default: elevenlabs

    const start = Date.now();
    let attempts = 0;
=======
    const backendFn = provider === 'azure'
      ? (signal) => _azure(text, locale, signal)
      : (signal) => _elevenlabs(text, signal); // default: elevenlabs

    const start    = Date.now();
    let   attempts = 0;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    try {
      const result = await withRetry(
        () => {
          attempts++;
          return breaker.exec(backendFn, { requestId, timeoutMs });
        },
<<<<<<< HEAD
        { maxRetries, baseMs, maxMs, shouldRetry: _isRetryable }
=======
        { maxRetries, baseMs, maxMs, shouldRetry: _isRetryable },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      );

      const latency = Date.now() - start;
      recordRequest('tts', 'success');
      recordLatency('tts', latency);
<<<<<<< HEAD
      log.debug(
        { requestId, provider, locale, latency, attempts, state: breaker.getState() },
        'TTS OK'
      );
      return result;
=======
      log.debug({ requestId, provider, locale, latency, attempts, state: breaker.getState() }, 'TTS OK');
      return result;

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    } catch (err) {
      const latency = Date.now() - start;
      recordRequest('tts', _requestStatus(err));
      recordFailure('tts', _failureReason(err));
      recordLatency('tts', latency);
<<<<<<< HEAD
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
=======
      log.warn({
        requestId, provider, locale, latency, attempts,
        state: breaker.getState(),
        err:   err.message,
      }, 'TTS failed');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      throw err;
    }
  };
}

// ── Default production instance ───────────────────────────────────────────────

const _defaultBreaker = new CircuitBreaker('tts', {
<<<<<<< HEAD
  failureThreshold: 5,
  errorRateThreshold: 0.5,
  minCalls: 10,
  windowMs: 60_000,
  openDurationMs: 60_000,
=======
  failureThreshold:   5,
  errorRateThreshold: 0.5,
  minCalls:           10,
  windowMs:           60_000,
  openDurationMs:     60_000,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  onStateChange(state, name) {
    log.warn({ provider: name, state }, `Circuit breaker → ${state}`);
    setCircuitState(name, state);
  },
});

/** Production synthesis function — use this in application code. */
export const synthesize = _makeSynthesize(_defaultBreaker);
