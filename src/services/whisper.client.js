// src/services/whisper.client.js — STT transcription with circuit breaker + retry.
//
// Backends:
//   'local-server' — whisper.cpp / faster-whisper local HTTP server
//   'openai'       — OpenAI Whisper API  (~$0.006/min)
//   'mock'         — Rotating French phrases (dev / test, bypasses circuit breaker)
//
// Circuit breaker protects only real backends.  Mock always succeeds locally.

<<<<<<< HEAD
import { randomUUID } from 'crypto';
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
=======
import { randomUUID }  from 'crypto';
import { childLogger } from '../core/logger.js';
import { config }      from '../core/config.js';
import { apiFetch }    from '../infra/http/httpClient.js';
import {
  CircuitBreaker, CircuitOpenError, TimeoutError, HttpError, withRetry,
} from './circuitBreaker.js';
import {
  recordRequest, recordFailure, recordLatency, setCircuitState,
} from './metrics.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

const log = childLogger('whisper');

// ── Mock phrases ──────────────────────────────────────────────────────────────

const MOCK_PHRASES = [
  "j'ai un rendez-vous demain à quatorze heures trente",
  'annule mon rendez-vous de mercredi',
  'quels sont mes rendez-vous de la semaine',
  'réunion avec Jean lundi prochain à neuf heures',
  'déplace mon meeting de vendredi à quinze heures',
];
let _mockIdx = 0;

// ── Multipart builder ─────────────────────────────────────────────────────────

function _buildMultipart(wavBuffer, filename = `audio_${Date.now()}.wav`) {
  const boundary = `----FormBoundary${randomUUID().replace(/-/g, '')}`;
  const body = Buffer.concat([
<<<<<<< HEAD
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`
    ),
=======
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    wavBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { boundary, body };
}

// ── Backend implementations ───────────────────────────────────────────────────

/**
 * @param {Buffer}      wavBuffer
 * @param {AbortSignal} signal     From circuit breaker's AbortController.
 */
async function _localServer(wavBuffer, signal) {
  const { boundary, body } = _buildMultipart(wavBuffer);
  const res = await apiFetch(config.WHISPER_SERVER_URL, {
<<<<<<< HEAD
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
=======
    method:  'POST',
    headers: {
      'Content-Type':   `multipart/form-data; boundary=${boundary}`,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      'Content-Length': String(body.length),
    },
    body,
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new HttpError(res.status, `Whisper local ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.text ?? json.transcription ?? json.result ?? json.transcript ?? '';
  if (!text.trim()) throw new Error('Whisper local server: empty response');
  return text.trim();
}

/**
 * @param {Buffer}      wavBuffer
 * @param {AbortSignal} signal
 */
async function _openai(wavBuffer, signal) {
  if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const boundary = `----FormBoundary${randomUUID().replace(/-/g, '')}`;
  const body = Buffer.concat([
<<<<<<< HEAD
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`
    ),
    wavBuffer,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1` +
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nfr` +
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson` +
        `\r\n--${boundary}--\r\n`
    ),
  ]);
  const res = await apiFetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
=======
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
    wavBuffer,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1` +
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nfr` +
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson` +
      `\r\n--${boundary}--\r\n`,
    ),
  ]);
  const res = await apiFetch('https://api.openai.com/v1/audio/transcriptions', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${config.OPENAI_API_KEY}`,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new HttpError(res.status, `OpenAI Whisper ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.text?.trim()) throw new Error('OpenAI Whisper: empty response');
  return json.text.trim();
}

function _mock() {
  const phrase = MOCK_PHRASES[_mockIdx % MOCK_PHRASES.length];
  _mockIdx++;
  log.debug({ phrase }, 'Whisper mock transcription');
  return Promise.resolve(phrase);
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
 * Create a `transcribeWav` function bound to a specific CircuitBreaker instance.
 *
 * Exported for testing — production code uses the default export `transcribeWav`.
 *
 * @param {CircuitBreaker} breaker
 * @param {object}         [retryOpts]         Forwarded to withRetry (override for tests).
 * @param {number}         [retryOpts.maxRetries=2]
 * @param {number}         [retryOpts.baseMs=200]
 * @param {number}         [retryOpts.maxMs=2000]
 * @returns {function(Buffer, object?): Promise<string>}
 */
export function _makeTranscribeWav(breaker, retryOpts = {}) {
<<<<<<< HEAD
  const { maxRetries = 2, baseMs = 200, maxMs = 2_000 } = retryOpts;
=======
  const {
    maxRetries = 2,
    baseMs     = 200,
    maxMs      = 2_000,
  } = retryOpts;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  // Initialise the state gauge for this breaker
  setCircuitState(breaker.name, breaker.getState());

  /**
   * Transcribe a WAV buffer to text.
   *
   * @param {Buffer} wavBuffer  Clean PCM16 16kHz WAV — validated upstream.
   * @param {object} [opts]
   * @param {string} [opts.requestId='']
   * @param {number} [opts.timeoutMs]     Per-call deadline (default: WHISPER_TIMEOUT).
   * @returns {Promise<string>}
   * @throws {CircuitOpenError}  When breaker is OPEN and timer has not expired.
   * @throws {TimeoutError}      When the backend does not respond in time.
   * @throws {HttpError}         On non-retryable HTTP errors (4xx).
   */
  return async function transcribeWav(wavBuffer, opts = {}) {
    if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44) {
      throw new Error('[Whisper] Invalid or too-short WAV buffer');
    }

<<<<<<< HEAD
    const { requestId = '', timeoutMs = config.WHISPER_TIMEOUT ?? 15_000 } = opts;
=======
    const {
      requestId = '',
      timeoutMs = config.WHISPER_TIMEOUT ?? 15_000,
    } = opts;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    const backend = config.WHISPER_BACKEND;

    // Mock bypasses circuit breaker — always local, never fails systematically
    if (backend === 'mock') return _mock();

    const backendFn = backend === 'openai' ? _openai : _localServer;
<<<<<<< HEAD
    const start = Date.now();
    let attempts = 0;
=======
    const start     = Date.now();
    let   attempts  = 0;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    try {
      const result = await withRetry(
        () => {
          attempts++;
<<<<<<< HEAD
          return breaker.exec(signal => backendFn(wavBuffer, signal), { requestId, timeoutMs });
        },
        { maxRetries, baseMs, maxMs, shouldRetry: _isRetryable }
=======
          return breaker.exec(
            (signal) => backendFn(wavBuffer, signal),
            { requestId, timeoutMs },
          );
        },
        { maxRetries, baseMs, maxMs, shouldRetry: _isRetryable },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      );

      const latency = Date.now() - start;
      recordRequest('whisper', 'success');
      recordLatency('whisper', latency);
      log.debug({ requestId, latency, attempts, state: breaker.getState() }, 'Whisper OK');
      return result;
<<<<<<< HEAD
=======

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    } catch (err) {
      const latency = Date.now() - start;
      recordRequest('whisper', _requestStatus(err));
      recordFailure('whisper', _failureReason(err));
      recordLatency('whisper', latency);
<<<<<<< HEAD
      log.warn(
        {
          requestId,
          latency,
          attempts,
          state: breaker.getState(),
          err: err.message,
        },
        'Whisper failed'
      );
=======
      log.warn({
        requestId, latency, attempts,
        state: breaker.getState(),
        err:   err.message,
      }, 'Whisper failed');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      throw err;
    }
  };
}

// ── Default production instance ───────────────────────────────────────────────

const _defaultBreaker = new CircuitBreaker('whisper', {
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

/** Production transcription function — use this in application code. */
export const transcribeWav = _makeTranscribeWav(_defaultBreaker);
