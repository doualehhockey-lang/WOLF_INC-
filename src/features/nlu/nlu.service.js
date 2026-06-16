// src/features/nlu/nlu.service.js — Natural Language Understanding service.
// Delegates analysis to Claude (preferred) or Ollama (fallback).
// Resolves implicit references using conversational memory context.
// Returns a fully-typed NluResult with confidence, missing fields, and ISO dates.

<<<<<<< HEAD
import { childLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
import { nluLatency } from '../../core/metrics.js';
import { normalizeIntent } from '../agent/intent.normalizer.js';
import { buildContext, getLastEntities, detectShortAnswer } from '../memory/memory.service.js';
import { CircuitBreaker, CircuitOpenError } from '../../services/circuitBreaker.js';
=======
import { childLogger }                       from '../../core/logger.js';
import { config }                            from '../../core/config.js';
import { nluLatency }                        from '../../core/metrics.js';
import { normalizeIntent }                   from '../agent/intent.normalizer.js';
import { buildContext, getLastEntities, detectShortAnswer } from '../memory/memory.service.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

const log = childLogger('nlu');
const CONFIDENCE_THRESHOLD = 0.3;

<<<<<<< HEAD
// ── Circuit breakers — one per LLM provider ───────────────────────────────────

const _claudeBreaker = new CircuitBreaker('claude', {
  failureThreshold: 3,
  openDurationMs: 30_000,
  onStateChange: (state, name) => log.warn({ state, name }, 'NLU circuit breaker state change'),
});

const NLU_TIMEOUT_MS = 7_000;

async function _analyze(message) {
  return _claudeBreaker.exec(
    async () => {
      const { analyze } = await import('../../services/claude.client.js');
      return analyze(message, { model: config.CLAUDE_MODEL, temperature: 0.05 });
    },
    { timeoutMs: NLU_TIMEOUT_MS }
  );
=======
// ── LLM backend (dynamic import — avoids crashing when API key is absent) ─────

async function _analyze(message) {
  // Prefer Claude when API key is configured
  if (config.CLAUDE_API_KEY) {
    const { analyze } = await import('../../services/claude.client.js');
    return analyze(message, { model: config.CLAUDE_MODEL, temperature: 0.05 });
  }
  // Fall back to local Ollama
  const { analyze } = await import('../../services/ollama.client.js');
  return analyze(message, { model: config.OLLAMA_MODEL, temperature: 0.05 });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}

// ── Date resolver (dynamic import — dateparser may not exist in all envs) ─────

async function _resolveDateTime(rawDate, rawTime, referenceDate) {
  try {
    const { resolve } = await import('../../services/dateparser.js');
    return await resolve(rawDate, rawTime, referenceDate);
  } catch {
    // dateparser not available — return a best-effort result
<<<<<<< HEAD
    return {
      date: rawDate || null,
      time: rawTime || null,
      iso: null,
      hasDate: !!rawDate,
      hasTime: !!rawTime,
    };
=======
    return { date: rawDate || null, time: rawTime || null, iso: null, hasDate: !!rawDate, hasTime: !!rawTime };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  }
}

// ── Implicit reference resolver ───────────────────────────────────────────────

async function _resolveImplicit(nlu, text, callSid) {
  if (!callSid) return nlu;

<<<<<<< HEAD
  const shortAnswer = detectShortAnswer(text);
=======
  const shortAnswer  = detectShortAnswer(text);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const lastEntities = await getLastEntities(callSid);
  if (!lastEntities) return nlu;

  if (shortAnswer === 'confirm' && lastEntities.intent) {
    log.debug({ resolved: 'confirm', intent: lastEntities.intent }, 'Implicit reference resolved');
<<<<<<< HEAD
    return {
      ...nlu,
      intent: lastEntities.intent,
      date: lastEntities.isoDate ?? nlu.date,
      time: lastEntities.isoTime ?? nlu.time,
      subject: lastEntities.subject ?? nlu.subject,
      _resolved: 'confirm',
    };
=======
    return { ...nlu, intent: lastEntities.intent,
      date:    lastEntities.isoDate ?? nlu.date,
      time:    lastEntities.isoTime ?? nlu.time,
      subject: lastEntities.subject ?? nlu.subject,
      _resolved: 'confirm' };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  }

  if (shortAnswer === 'deny') {
    log.debug({ resolved: 'deny' }, 'Implicit reference resolved');
    return { ...nlu, intent: 'unknown', _resolved: 'deny' };
  }

  if (nlu.intent === 'unknown' || nlu.confidence < 0.4) {
<<<<<<< HEAD
    const lower = text.toLowerCase();
    const normalised = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (/annul|supprim|efface/.test(lower) && lastEntities.isoDate) {
      return {
        ...nlu,
        intent: 'cancel_event',
        date: lastEntities.isoDate,
        time: lastEntities.isoTime,
        _resolved: 'implicit-cancel',
      };
    }
    if (/change|decal|deplace|repousse|modif/.test(normalised)) {
      return {
        ...nlu,
        intent: 'update_event',
        date: nlu.date || lastEntities.isoDate,
        time: nlu.time || lastEntities.isoTime,
        _resolved: 'implicit-update',
      };
=======
    const lower      = text.toLowerCase();
    const normalised = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (/annul|supprim|efface/.test(lower) && lastEntities.isoDate) {
      return { ...nlu, intent: 'cancel_event',
        date: lastEntities.isoDate, time: lastEntities.isoTime, _resolved: 'implicit-cancel' };
    }
    if (/change|decal|deplace|repousse|modif/.test(normalised)) {
      return { ...nlu, intent: 'update_event',
        date: nlu.date || lastEntities.isoDate,
        time: nlu.time || lastEntities.isoTime, _resolved: 'implicit-update' };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    }
  }

  return nlu;
}

// ── Missing fields ────────────────────────────────────────────────────────────

function _getMissing(intent, resolved) {
  const m = [];
  if (intent === 'create_event') {
    if (!resolved.hasDate) m.push('date');
    if (!resolved.hasTime) m.push('heure');
  }
  if (intent === 'cancel_event' || intent === 'update_event') {
    if (!resolved.hasDate) m.push('date');
  }
  return m;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} NluResult
 * @property {boolean}     ok
 * @property {string}      intent
 * @property {string}      rawIntent
 * @property {string}      subject
 * @property {string}      date
 * @property {string}      time
 * @property {string|null} isoDate
 * @property {string|null} isoTime
 * @property {string|null} iso
 * @property {number}      confidence
 * @property {boolean}     needsClarification
 * @property {string[]}    missing
 * @property {string[]}    errors
 * @property {string}      strategy
 * @property {string}      [_resolved]
 */

/**
 * @param {string}  text
 * @param {string}  [callSid]
 * @param {Date}    [referenceDate]
 * @returns {Promise<NluResult>}
 */
export async function understand(text, callSid = null, referenceDate = new Date()) {
  if (!text?.trim()) return _fail('empty-transcript');

<<<<<<< HEAD
  const provider = 'claude';
  const timer = nluLatency.startTimer({ provider });

  const context = callSid ? await buildContext(callSid) : '';
=======
  const provider = config.CLAUDE_API_KEY ? 'claude' : 'ollama';
  const timer    = nluLatency.startTimer({ provider });

  const context     = callSid ? await buildContext(callSid) : '';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const fullMessage = context
    ? `${context}\n\nNouveau message à analyser : "${text.trim()}"`
    : text.trim();

  if (context) log.debug({ callSid }, 'Memory context injected');

  let nlu;
  try {
    nlu = await _analyze(fullMessage);
    timer({ success: 'true' });
  } catch (err) {
    timer({ success: 'false' });
<<<<<<< HEAD
    if (err instanceof CircuitOpenError) {
      log.warn({ provider: err.provider, callSid }, 'NLU circuit breaker open — rejecting request');
    } else {
      log.error({ err: err.message, callSid }, 'NLU analyze() failed');
    }
=======
    log.error({ err: err.message, callSid }, 'NLU analyze() failed');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    return _fail(`analyze-error: ${err.message}`);
  }

  nlu = await _resolveImplicit(nlu, text.trim(), callSid);

  if (nlu.confidence < CONFIDENCE_THRESHOLD && !nlu._resolved) {
    return {
<<<<<<< HEAD
      ok: false,
      intent: 'unknown',
      rawIntent: nlu.intent,
      subject: '',
      date: '',
      time: '',
      isoDate: null,
      isoTime: null,
      iso: null,
      confidence: nlu.confidence,
      needsClarification: true,
      missing: [],
      errors: ['low-confidence'],
      strategy: nlu.strategy,
    };
  }

  const intent = normalizeIntent(nlu.intent);
  const lastEntities = callSid ? await getLastEntities(callSid) : null;
  const rawDate = nlu.date || (lastEntities?.isoDate ?? '');
  const rawTime = nlu.time || (lastEntities?.isoTime ?? '');
  const resolved = await _resolveDateTime(rawDate, rawTime, referenceDate);
  const missing = _getMissing(intent, resolved);
=======
      ok: false, intent: 'unknown', rawIntent: nlu.intent,
      subject: '', date: '', time: '',
      isoDate: null, isoTime: null, iso: null,
      confidence: nlu.confidence, needsClarification: true,
      missing: [], errors: ['low-confidence'], strategy: nlu.strategy,
    };
  }

  const intent       = normalizeIntent(nlu.intent);
  const lastEntities = callSid ? await getLastEntities(callSid) : null;
  const rawDate      = nlu.date   || (lastEntities?.isoDate ?? '');
  const rawTime      = nlu.time   || (lastEntities?.isoTime ?? '');
  const resolved     = await _resolveDateTime(rawDate, rawTime, referenceDate);
  const missing      = _getMissing(intent, resolved);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  log.info({ callSid, intent, confidence: Math.round(nlu.confidence * 100) }, 'NLU complete');

  return {
<<<<<<< HEAD
    ok: true,
    intent,
    rawIntent: nlu.intent,
    subject: nlu.subject ?? '',
    date: nlu.date ?? '',
    time: nlu.time ?? '',
    isoDate: resolved.date,
    isoTime: resolved.time,
    iso: resolved.iso,
    confidence: nlu.confidence,
    needsClarification: missing.length > 0,
    missing,
    errors: nlu.errors ?? [],
=======
    ok: true, intent, rawIntent: nlu.intent,
    subject:  nlu.subject ?? '',
    date:     nlu.date    ?? '',
    time:     nlu.time    ?? '',
    isoDate:  resolved.date,
    isoTime:  resolved.time,
    iso:      resolved.iso,
    confidence:         nlu.confidence,
    needsClarification: missing.length > 0,
    missing,
    errors:   nlu.errors ?? [],
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    strategy: nlu.strategy,
    _resolved: nlu._resolved,
  };
}

function _fail(reason) {
  return {
<<<<<<< HEAD
    ok: false,
    intent: 'unknown',
    rawIntent: '',
    subject: '',
    date: '',
    time: '',
    isoDate: null,
    isoTime: null,
    iso: null,
    confidence: 0,
    needsClarification: false,
    missing: [],
    errors: [reason],
    strategy: 'none',
=======
    ok: false, intent: 'unknown', rawIntent: '', subject: '',
    date: '', time: '', isoDate: null, isoTime: null, iso: null,
    confidence: 0, needsClarification: false, missing: [],
    errors: [reason], strategy: 'none',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  };
}
