// @ts-nocheck
// src/services/ollama.client.js — Ollama local LLM client.
// Provides: chat() for free-form generation, analyze() for NLU (same interface as claude.client).
//
// Circuit breaker protects chat() — analyze() wraps chat() and returns a safe
// fallback object on any error (including CircuitOpenError) rather than propagating.

import { childLogger } from '../core/logger.js';
import { config }      from '../core/config.js';
import { apiFetch }    from '../infra/http/httpClient.js';
import {
  CircuitBreaker, CircuitOpenError, TimeoutError, HttpError, withRetry,
} from './circuitBreaker.js';
import {
  recordRequest, recordFailure, recordLatency, setCircuitState,
} from './metrics.js';

const log = childLogger('ollama');

// ── Error classification ──────────────────────────────────────────────────────

function _isRetryable(err) {
  if (err instanceof CircuitOpenError) return false;
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) return false;
  return true; // network errors, timeouts, 5xx
}

function _requestStatus(err) {
  if (err instanceof CircuitOpenError) return 'circuit_open';
  if (err instanceof TimeoutError)     return 'timeout';
  return 'error';
}

function _failureReason(err) {
  if (err instanceof CircuitOpenError) return 'circuit_open';
  if (err instanceof TimeoutError)     return 'timeout';
  if (err instanceof HttpError)        return err.status >= 500 ? 'http_5xx' : 'http_4xx';
  return 'network';
}

// ── NLU fallback (analyze error path) ────────────────────────────────────────

function _analyzeError(reason) {
  return {
    intent:     'unknown',
    subject:    '',
    date:       '',
    time:       '',
    confidence: 0,
    errors:     [reason],
    strategy:   'ollama-error',
  };
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create `{ chat, analyze }` functions bound to a specific CircuitBreaker instance.
 *
 * Exported for testing — production code should use the named exports `chat` / `analyze`.
 *
 * @param {CircuitBreaker} breaker
 * @param {object}         [retryOpts]              Forwarded to withRetry (override for tests).
 * @param {number}         [retryOpts.maxRetries=2]
 * @param {number}         [retryOpts.baseMs=200]
 * @param {number}         [retryOpts.maxMs=2000]
 * @returns {{ chat: function, analyze: function }}
 */
export function _makeOllamaClient(breaker, retryOpts = {}) {
  const {
    maxRetries = 2,
    baseMs     = 200,
    maxMs      = 2_000,
  } = retryOpts;

  setCircuitState(breaker.name, breaker.getState());

  // ── chat() ──────────────────────────────────────────────────────────────────

  /**
   * Send a messages array to Ollama and return the assistant reply text.
   *
   * @param {Array<{role:string,content:string}>} messages
   * @param {object} [opts]
   * @param {string} [opts.requestId='']
   * @param {string} [opts.model]           Defaults to config.OLLAMA_MODEL.
   * @param {number} [opts.temperature=0.7]
   * @param {number} [opts.num_predict=-1]
   * @param {number} [opts.timeoutMs]       Defaults to config.OLLAMA_TIMEOUT (120s).
   * @returns {Promise<string>}
   * @throws {CircuitOpenError}  When breaker is OPEN.
   * @throws {TimeoutError}      When Ollama does not respond in time.
   * @throws {HttpError}         On non-retryable HTTP errors (4xx).
   */
  async function chat(messages, opts = {}) {
    const {
      requestId  = '',
      model      = config.OLLAMA_MODEL,
      temperature = 0.7,
      num_predict = -1,
      timeoutMs  = config.OLLAMA_TIMEOUT ?? 120_000,
    } = opts;

    const body = JSON.stringify({ model, messages, stream: false, options: { temperature, num_predict } });
    const start    = Date.now();
    let   attempts = 0;

    try {
      const result = await withRetry(
        () => {
          attempts++;
          return breaker.exec(
            async (signal) => {
              const res = await apiFetch(`${config.OLLAMA_URL}/api/chat`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal,
              });
              if (!res.ok) {
                const detail = await res.text().catch(() => '');
                throw new HttpError(res.status, `Ollama ${res.status}: ${detail.slice(0, 200)}`);
              }
              const json = await res.json();
              return json.message?.content?.trim() ?? '';
            },
            { requestId, timeoutMs },
          );
        },
        { maxRetries, baseMs, maxMs, shouldRetry: _isRetryable },
      );

      const latency = Date.now() - start;
      recordRequest('ollama', 'success');
      recordLatency('ollama', latency);
      log.debug({ requestId, model, latency, attempts, state: breaker.getState() }, 'Ollama chat OK');
      return result;

    } catch (err) {
      const latency = Date.now() - start;
      recordRequest('ollama', _requestStatus(err));
      recordFailure('ollama', _failureReason(err));
      recordLatency('ollama', latency);
      log.warn({
        requestId, model, latency, attempts,
        state: breaker.getState(),
        err:   err.message,
      }, 'Ollama chat failed');
      throw err;
    }
  }

  // ── analyze() ───────────────────────────────────────────────────────────────

  /**
   * NLU analysis via Ollama — same interface as claude.client.analyze().
   * Never throws: returns a safe fallback object on any error.
   *
   * @param {string} text
   * @param {object} [opts]
   * @param {string} [opts.requestId]
   * @param {string} [opts.model]
   * @param {number} [opts.temperature=0.05]
   * @returns {Promise<object>}
   */
  async function analyze(text, opts = {}) {
    if (!text?.trim()) {
      return { intent: 'unknown', subject: '', date: '', time: '', confidence: 0, errors: ['empty-input'], strategy: 'none' };
    }

    const system =
      'Tu es un extracteur NLU. Retourne UNIQUEMENT une ligne JSON valide avec : ' +
      'intent (create_event|cancel_event|update_event|list_events|unknown), subject (string), ' +
      'date (ex: "demain", "lundi"), time (ex: "14h30"), confidence (number 0-1), errors (array), strategy (string).';

    try {
      const reply = await chat(
        [{ role: 'system', content: system }, { role: 'user', content: `Texte : "${text}"` }],
        {
          requestId:   opts.requestId,
          model:       opts.model       ?? config.OLLAMA_MODEL,
          temperature: opts.temperature ?? 0.05,
          num_predict: 256,
          timeoutMs:   opts.timeoutMs,
        },
      );

      const raw = reply.trim().replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(raw.split('\n')[0]);
      } catch {
        log.warn({ requestId: opts.requestId, raw: raw.slice(0, 200) }, 'Ollama JSON parse failed');
        return _analyzeError('parse-failed');
      }

      return {
        intent:     parsed.intent     ?? 'unknown',
        subject:    parsed.subject    ?? '',
        date:       parsed.date       ?? '',
        time:       parsed.time       ?? '',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        errors:     parsed.errors     ?? [],
        strategy:   'ollama',
      };
    } catch (err) {
      log.error({ requestId: opts.requestId, err: err.message }, 'Ollama analyze failed');
      return _analyzeError(err.message);
    }
  }

  return { chat, analyze };
}

// ── Default production instance ───────────────────────────────────────────────

const _defaultBreaker = new CircuitBreaker('ollama', {
  failureThreshold:   5,
  errorRateThreshold: 0.5,
  minCalls:           10,
  windowMs:           60_000,
  openDurationMs:     60_000,
  onStateChange(state, name) {
    log.warn({ provider: name, state }, `Circuit breaker → ${state}`);
    setCircuitState(name, state);
  },
});

export const { chat, analyze } = _makeOllamaClient(_defaultBreaker);
