// src/services/claude.client.js — Anthropic Claude API client.
// Provides: analyze() for NLU, translate() for multilingual responses.
// Falls back to rule-based NLU when API key is absent or circuit opens.
//
// Circuit breaker: opens after 5 consecutive failures OR >50% error rate in 60s.
// Retry: up to 2 retries with exponential backoff; skips 4xx and CircuitOpenError.

<<<<<<< HEAD
import { childLogger } from '../core/logger.js';
import { config } from '../core/config.js';
import { apiFetch } from '../infra/http/httpClient.js';
import { isEnabled, FLAGS } from '../core/featureFlags.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  HttpError,
  withRetry,
  STATE,
} from './circuitBreaker.js';
import { recordRequest, recordFailure, recordLatency, setCircuitState } from './metrics.js';
=======
import { childLogger }   from '../core/logger.js';
import { config }        from '../core/config.js';
import { apiFetch }      from '../infra/http/httpClient.js';
import { isEnabled, FLAGS } from '../core/featureFlags.js';
import {
  CircuitBreaker, CircuitOpenError, TimeoutError, HttpError, withRetry, STATE,
} from './circuitBreaker.js';
import {
  recordRequest, recordFailure, recordLatency, setCircuitState,
} from './metrics.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

const log = childLogger('claude');

// ── Circuit Breaker ───────────────────────────────────────────────────────────

const breaker = new CircuitBreaker('claude', {
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

// Initialise gauge to CLOSED on startup
setCircuitState('claude', STATE.CLOSED);

// ── Helpers ───────────────────────────────────────────────────────────────────

function _escJson(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/* c8 ignore next 4 — withRetry is mocked in all test suites; _isRetryable is internal and unreachable via the public API in tests */
function _isRetryable(err) {
  if (err instanceof CircuitOpenError) return false;
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) return false;
  return true;
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

function _requestStatus(err) {
  if (err instanceof CircuitOpenError) return 'circuit_open';
<<<<<<< HEAD
  if (err instanceof TimeoutError) return 'timeout';
=======
  if (err instanceof TimeoutError)     return 'timeout';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return 'error';
}

// ── Low-level API call ────────────────────────────────────────────────────────

/* c8 ignore next 3 — analyze() always guards CLAUDE_API_KEY before calling _call; this guard is unreachable in practice */
async function _call(body, { requestId = '' } = {}) {
  // Stryker disable next-line all -- defense-in-depth guard; analyze() pre-checks CLAUDE_API_KEY so this branch is structurally unreachable in tests
  if (!config.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY not configured');

<<<<<<< HEAD
  const start = Date.now();
  let attempts = 0;
=======
  const start    = Date.now();
  let   attempts = 0;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  try {
    const result = await withRetry(
      () => {
        attempts++;
        return breaker.exec(
<<<<<<< HEAD
          async signal => {
            const res = await apiFetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify(body),
=======
          async (signal) => {
            const res = await apiFetch('https://api.anthropic.com/v1/messages', {
              method:  'POST',
              headers: {
                'Content-Type':      'application/json',
                'x-api-key':         config.CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
              },
              body:   JSON.stringify(body),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
              signal,
            });

            if (!res.ok) {
              const detail = await res.text().catch(() => '');
              throw new HttpError(res.status, `Claude ${res.status}: ${detail.slice(0, 200)}`);
            }
            return res.json();
          },
<<<<<<< HEAD
          { requestId, timeoutMs: 30_000 }
        );
      },
      { maxRetries: 2, shouldRetry: _isRetryable }
=======
          { requestId, timeoutMs: 30_000 },
        );
      },
      { maxRetries: 2, shouldRetry: _isRetryable },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );

    const latency = Date.now() - start;
    recordRequest('claude', 'success');
    recordLatency('claude', latency);
    log.debug({ requestId, latency, attempts, state: breaker.getState() }, 'Claude OK');
    return result;
<<<<<<< HEAD
=======

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  } catch (err) {
    const latency = Date.now() - start;
    recordRequest('claude', _requestStatus(err));
    recordFailure('claude', _failureReason(err));
    recordLatency('claude', latency);
<<<<<<< HEAD
    log.warn(
      {
        requestId,
        latency,
        attempts,
        state: breaker.getState(),
        err: err.message,
      },
      'Claude request failed'
    );
=======
    log.warn({
      requestId, latency, attempts,
      state: breaker.getState(),
      err:   err.message,
    }, 'Claude request failed');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    throw err;
  }
}

// ── Rule-based fallback (no API key / circuit open) ───────────────────────────

function _ruleBased(text) {
  const lower = text.toLowerCase();
  let intent = 'unknown';
  if (/cr(ee|ée|éer|eer|e un|ajoute)|planif|book|schedul/.test(lower)) intent = 'create_event';
<<<<<<< HEAD
  else if (/annul|supprim|effac|retir|delet/.test(lower)) intent = 'cancel_event';
  else if (/modif|change|d[eé]place|replan|repouss/.test(lower)) intent = 'update_event';
  else if (/liste|quels|quoi|affich|show|display/.test(lower)) intent = 'list_events';

  const mTime = lower.match(/(\d{1,2})[h:](\d{0,2})/);
  const time = mTime ? `${mTime[1]}:${(mTime[2] || '00').padStart(2, '0')}` : '';
  const mDate = lower.match(
    /(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d{1,2})/
  );
  let date = '';
  if (mDate) {
    const d = mDate[1];
=======
  else if (/annul|supprim|effac|retir|delet/.test(lower))               intent = 'cancel_event';
  else if (/modif|change|d[eé]place|replan|repouss/.test(lower))        intent = 'update_event';
  else if (/liste|quels|quoi|affich|show|display/.test(lower))          intent = 'list_events';

  const mTime    = lower.match(/(\d{1,2})[h:](\d{0,2})/);
  const time     = mTime ? `${mTime[1]}:${(mTime[2] || '00').padStart(2, '0')}` : '';
  const mDate    = lower.match(/(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d{1,2})/);
  let   date     = '';
  if (mDate) {
    const d   = mDate[1];
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const now = new Date();
    if (d === "aujourd'hui") {
      date = now.toISOString().slice(0, 10);
    } else if (d === 'demain') {
<<<<<<< HEAD
      const dt = new Date(now);
      dt.setDate(dt.getDate() + 1);
      date = dt.toISOString().slice(0, 10);
=======
      const dt = new Date(now); dt.setDate(dt.getDate() + 1); date = dt.toISOString().slice(0, 10);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    } else if (/\d{1,2}\/\d{1,2}/.test(d)) {
      const [day, month] = d.split('/');
      date = new Date(now.getFullYear(), Number(month) - 1, Number(day)).toISOString().slice(0, 10);
    }
  }
  const mSubject = lower.match(/(?:pour |avec |concernant )(.+?)(?: à | au | en | le |$)/);
  return {
    intent,
<<<<<<< HEAD
    subject: mSubject?.[1]?.trim() ?? '',
    date,
    time,
    confidence: intent === 'unknown' ? 0.25 : 0.85,
    errors: [],
    strategy: 'rule-based',
=======
    subject:    mSubject?.[1]?.trim() ?? '',
    date,
    time,
    confidence: intent === 'unknown' ? 0.25 : 0.85,
    errors:     [],
    strategy:   'rule-based',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * NLU analysis — extract intent, date, time, subject from user text.
 * Falls back to rule-based extraction if Claude is unavailable.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.model]
 * @param {number} [opts.temperature]
 * @param {string} [opts.requestId]
 * @returns {Promise<object>}
 */
export async function analyze(text, opts = {}) {
  if (!text?.trim()) {
<<<<<<< HEAD
    return {
      intent: 'unknown',
      subject: '',
      date: '',
      time: '',
      confidence: 0,
      errors: ['empty-input'],
      strategy: 'none',
    };
=======
    return { intent: 'unknown', subject: '', date: '', time: '', confidence: 0, errors: ['empty-input'], strategy: 'none' };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  }

  const claudeEnabled = await isEnabled(FLAGS.CLAUDE_NLU);
  if (!config.CLAUDE_API_KEY || breaker.getState() === STATE.OPEN || !claudeEnabled) {
<<<<<<< HEAD
    log.debug(
      { requestId: opts.requestId, state: breaker.getState(), claudeEnabled },
      'Claude NLU unavailable — rule-based fallback'
    );
    return _ruleBased(text);
  }

  const model = opts.model ?? config.CLAUDE_MODEL;
=======
    log.debug({ requestId: opts.requestId, state: breaker.getState(), claudeEnabled }, 'Claude NLU unavailable — rule-based fallback');
    return _ruleBased(text);
  }

  const model  = opts.model ?? config.CLAUDE_MODEL;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const system =
    'Tu es un extracteur NLU. Retourne UNIQUEMENT une ligne JSON valide avec : ' +
    'intent (create_event|cancel_event|update_event|list_events|unknown), subject (string), ' +
    'date (ex: "demain", "lundi", "2026-04-10"), time (ex: "14h30", "09:00"), ' +
<<<<<<< HEAD
    "confidence (number 0-1), errors (array), strategy (string). Rien d'autre que le JSON.";

  try {
    const json = await _call(
      {
        model,
        max_tokens: 256,
        temperature: opts.temperature ?? 0,
        system,
        messages: [{ role: 'user', content: `Texte à analyser : "${_escJson(text)}"` }],
      },
      { requestId: opts.requestId }
    );

    const raw = (json.content?.[0]?.text ?? '')
      .trim()
      .replace(/^```json?\n?/i, '')
      .replace(/\n?```$/, '')
      .trim();
=======
    'confidence (number 0-1), errors (array), strategy (string). Rien d\'autre que le JSON.';

  try {
    const json = await _call({
      model, max_tokens: 256,
      temperature: opts.temperature ?? 0,
      system,
      messages: [{ role: 'user', content: `Texte à analyser : "${_escJson(text)}"` }],
    }, { requestId: opts.requestId });

    const raw = (json.content?.[0]?.text ?? '')
      .trim().replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    let parsed;
    try {
      parsed = JSON.parse(raw.split('\n')[0]);
    } catch {
<<<<<<< HEAD
      log.warn(
        { requestId: opts.requestId, raw: raw.slice(0, 200) },
        'Claude JSON parse failed — rule-based fallback'
      );
=======
      log.warn({ requestId: opts.requestId, raw: raw.slice(0, 200) }, 'Claude JSON parse failed — rule-based fallback');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      return _ruleBased(text);
    }

    return {
<<<<<<< HEAD
      intent: parsed.intent ?? 'unknown',
      subject: parsed.subject ?? '',
      date: parsed.date ?? '',
      time: parsed.time ?? '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      errors: parsed.errors ?? [],
      strategy: parsed.strategy ?? 'claude',
    };
  } catch (err) {
    log.warn(
      { requestId: opts.requestId, err: err.message },
      'Claude analyze failed — rule-based fallback'
    );
=======
      intent:     parsed.intent     ?? 'unknown',
      subject:    parsed.subject    ?? '',
      date:       parsed.date       ?? '',
      time:       parsed.time       ?? '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      errors:     parsed.errors     ?? [],
      strategy:   parsed.strategy   ?? 'claude',
    };
  } catch (err) {
    log.warn({ requestId: opts.requestId, err: err.message }, 'Claude analyze failed — rule-based fallback');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    return _ruleBased(text);
  }
}

/**
 * Translate text to the target language.
 * Returns original text on failure or missing API key.
 *
 * @param {string} text
 * @param {string} [targetLang='fr']
 * @param {object} [opts]
 * @param {string} [opts.requestId]
 * @returns {Promise<string>}
 */
export async function translate(text, targetLang = 'fr', opts = {}) {
  if (!text?.trim() || !config.CLAUDE_API_KEY || breaker.getState() === STATE.OPEN) return text;
  if (targetLang === 'fr') return text;

  try {
<<<<<<< HEAD
    const json = await _call(
      {
        model: config.CLAUDE_MODEL,
        max_tokens: 256,
        temperature: 0.3,
        system:
          'Tu es un traducteur. Traduis fidèlement le texte dans la langue cible. Conserve le sens et le ton.',
        messages: [
          { role: 'user', content: `Texte : "${_escJson(text)}"\nLangue cible : ${targetLang}` },
        ],
      },
      { requestId: opts.requestId }
    );
    return json.content?.[0]?.text?.trim() || text;
  } catch (err) {
    log.warn(
      { requestId: opts.requestId, err: err.message },
      'Claude translate failed — returning original'
    );
=======
    const json = await _call({
      model:       config.CLAUDE_MODEL,
      max_tokens:  256,
      temperature: 0.3,
      system:      'Tu es un traducteur. Traduis fidèlement le texte dans la langue cible. Conserve le sens et le ton.',
      messages:    [{ role: 'user', content: `Texte : "${_escJson(text)}"\nLangue cible : ${targetLang}` }],
    }, { requestId: opts.requestId });
    return json.content?.[0]?.text?.trim() || text;
  } catch (err) {
    log.warn({ requestId: opts.requestId, err: err.message }, 'Claude translate failed — returning original');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    return text;
  }
}
