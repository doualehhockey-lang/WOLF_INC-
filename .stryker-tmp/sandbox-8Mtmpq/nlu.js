// @ts-nocheck
// nlu.js — v2
// NLU avec mémoire conversationnelle.
// Le contexte des tours précédents est injecté dans le prompt → résout les références implicites.

'use strict';

import { analyze } from './claude.js';
import { normalizeIntent } from './agent.js';
import { resolve as resolveDateTime } from './dateparser.js';
import { config } from './env.js';
import { childLogger } from './utils/logger.js';
import { buildContext, getLastEntities, detectShortAnswer } from './memory.js';

const log = childLogger('nlu');
const CONFIDENCE_THRESHOLD = 0.3;

// ── Prompt contextuel ─────────────────────────────────────────────────────────

function buildContextualMessage(text, context) {
  if (!context) return text;
  return `${context}\n\nNouveau message à analyser : "${text}"`;
}

// ── Résolution des références implicites ──────────────────────────────────────

function resolveImplicitReferences(nlu, text, callSid) {
  if (!callSid) return nlu;

  const shortAnswer = detectShortAnswer(text);
  const lastEntities = getLastEntities(callSid);
  if (!lastEntities) return nlu;

  if (shortAnswer === 'confirm' && lastEntities.intent) {
    log.debug({ resolved: 'confirm', intent: lastEntities.intent }, 'Implicit reference resolved');
    return {
      ...nlu,
      intent: lastEntities.intent,
      date: lastEntities.isoDate ?? nlu.date,
      time: lastEntities.isoTime ?? nlu.time,
      subject: lastEntities.subject ?? nlu.subject,
      _resolved: 'confirm',
    };
  }

  if (shortAnswer === 'deny') {
    log.debug({ resolved: 'deny' }, 'Implicit reference resolved');
    return { ...nlu, intent: 'unknown', _resolved: 'deny' };
  }

  if (nlu.intent === 'unknown' || nlu.confidence < 0.4) {
    const lower = text.toLowerCase();

    if (/annul|supprim|efface/.test(lower) && lastEntities.isoDate) {
      log.debug(
        { text: text.slice(0, 40), resolved: 'implicit-cancel' },
        'Implicit reference resolved'
      );
      return {
        ...nlu,
        intent: 'cancel_event',
        date: lastEntities.isoDate,
        time: lastEntities.isoTime,
        _resolved: 'implicit-cancel',
      };
    }

    const normalised = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/change|decal|deplace|repousse|modif/.test(normalised)) {
      log.debug(
        { text: text.slice(0, 40), resolved: 'implicit-update' },
        'Implicit reference resolved'
      );
      return {
        ...nlu,
        intent: 'update_event',
        date: nlu.date || lastEntities.isoDate,
        time: nlu.time || lastEntities.isoTime,
        _resolved: 'implicit-update',
      };
    }
  }

  return nlu;
}

// ── API PUBLIQUE ──────────────────────────────────────────────────────────────

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
  if (!text?.trim()) return _failResult('empty-transcript');

  const context = callSid ? buildContext(callSid) : '';
  const fullMessage = buildContextualMessage(text.trim(), context);

  if (context) log.debug({ callSid }, 'Memory context injected into NLU prompt');

  let nlu;
  try {
    nlu = await analyze(fullMessage, { model: config.ollama.model, temperature: 0.05 });
  } catch (err) {
    log.error({ err: err.message, callSid }, 'NLU analyze() failed');
    return _failResult(`analyze-error: ${err.message}`);
  }

  nlu = resolveImplicitReferences(nlu, text.trim(), callSid);

  if (nlu.confidence < CONFIDENCE_THRESHOLD && !nlu._resolved) {
    return {
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
  const lastEntities = callSid ? getLastEntities(callSid) : null;
  const rawDate = nlu.date || (lastEntities?.isoDate ?? '');
  const rawTime = nlu.time || (lastEntities?.isoTime ?? '');
  const resolved = resolveDateTime(rawDate, rawTime, referenceDate);
  const missing = _getMissing(intent, resolved);

  return {
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
    needsClarification: false,
    missing,
    errors: nlu.errors ?? [],
    strategy: nlu.strategy,
    _resolved: nlu._resolved,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function _failResult(reason) {
  return {
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
  };
}
