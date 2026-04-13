// src/services/nlu.js — v2
// NLU avec mémoire conversationnelle.
//
// AMÉLIORATION v2 : le contexte des tours précédents est injecté dans le prompt
// Ollama → résout les références implicites ("annule-le", "change l'heure").

'use strict';

import { analyze }                    from './claude.js';
import { normalizeIntent }            from './agent.js';
import { resolve as resolveDateTime } from './dateparser.js';
import { config }                     from './env.js';
import {
  buildContext,
  getLastEntities,
  detectShortAnswer,
} from './memory.js';

const CONFIDENCE_THRESHOLD = 0.30; // légèrement abaissé — le contexte aide le LLM

// ═══════════════════════════════════════════════════════════
// PROMPT CONTEXTUEL
// ═══════════════════════════════════════════════════════════

/**
 * Construit le message utilisateur enrichi du contexte mémoire.
 * Si un historique existe, il est préfixé au message pour guider le LLM.
 * @param {string} text
 * @param {string} context - historique formaté par memory.buildContext()
 * @returns {string}
 */
function buildContextualMessage(text, context) {
  if (!context) return text;
  return `${context}\n\nNouveau message à analyser : "${text}"`;
}

// ═══════════════════════════════════════════════════════════
// RÉSOLUTION DES RÉFÉRENCES IMPLICITES
// ═══════════════════════════════════════════════════════════

/**
 * Si le LLM retourne 'unknown' mais qu'on a un contexte pending,
 * tente de résoudre les références implicites.
 *
 * Ex: "annule-le" → intent:unknown + contexte:{ pendingIntent:'create_event', pendingDate:'2026-03-19' }
 *     → on infère intent:cancel_event avec la même date
 *
 * @param {Object} nlu        - résultat brut du LLM
 * @param {string} text       - message original
 * @param {string} callSid    - pour accéder aux entités mémorisées
 * @returns {Object}          - nlu potentiellement enrichi
 */
function resolveImplicitReferences(nlu, text, callSid) {
  if (!callSid) return nlu;

  const shortAnswer = detectShortAnswer(text);
  const lastEntities = getLastEntities(callSid);

  if (!lastEntities) return nlu;

  // Cas 1 : "oui" / "confirme" après une question de l'agent
  // → confirme le dernier intent en cours
  if (shortAnswer === 'confirm' && lastEntities.intent) {
    console.log(`[NLU] Référence implicite résolue: "confirm" → ${lastEntities.intent}`);
    return {
      ...nlu,
      intent:  lastEntities.intent,
      date:    lastEntities.isoDate ?? nlu.date,
      time:    lastEntities.isoTime ?? nlu.time,
      subject: lastEntities.subject ?? nlu.subject,
      _resolved: 'confirm',
    };
  }

  // Cas 2 : "non" / "annule" → annule l'action en cours
  if (shortAnswer === 'deny') {
    console.log('[NLU] Référence implicite résolue: "deny" → unknown (action annulée)');
    return { ...nlu, intent: 'unknown', _resolved: 'deny' };
  }

  // Cas 3 : verbe implicite ("annule-le", "supprime-le", "change l'heure")
  // Le LLM retourne unknown parce qu'il n'a pas le contexte de "le"
  if (nlu.intent === 'unknown' || nlu.confidence < 0.4) {
    const lower = text.toLowerCase();

    // "annule-le", "annule ça", "supprime"
    if (/annul|supprim|efface/.test(lower) && lastEntities.isoDate) {
      console.log(`[NLU] Référence implicite résolue: "${text}" → cancel_event`);
      return {
        ...nlu,
        intent:  'cancel_event',
        date:    lastEntities.isoDate,
        time:    lastEntities.isoTime,
        _resolved: 'implicit-cancel',
      };
    }

    // "change l'heure", "décale", "déplace"
    if (/change|decal|deplace|repousse|modif/.test(lower.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
      console.log(`[NLU] Référence implicite résolue: "${text}" → update_event`);
      return {
        ...nlu,
        intent:  'update_event',
        date:    nlu.date || lastEntities.isoDate,
        time:    nlu.time || lastEntities.isoTime,
        _resolved: 'implicit-update',
      };
    }
  }

  return nlu;
}

// ═══════════════════════════════════════════════════════════
// API PUBLIQUE
// ═══════════════════════════════════════════════════════════

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
 * @property {string}      [_resolved] - debug: comment la référence implicite a été résolue
 */

/**
 * Analyse un texte transcrit avec contexte mémoire.
 * @param {string}  text
 * @param {string}  [callSid]       - pour la mémoire conversationnelle
 * @param {Date}    [referenceDate]
 * @returns {Promise<NluResult>}
 */
export async function understand(text, callSid = null, referenceDate = new Date()) {
  if (!text?.trim()) return _failResult('empty-transcript');

  // ── 1. Contexte mémoire ─────────────────────────────────
  const context = callSid ? buildContext(callSid) : '';
  const fullMessage = buildContextualMessage(text.trim(), context);

  if (context) console.log('[NLU] Contexte injecté dans le prompt');

  // ── 2. Appel Ollama ─────────────────────────────────────
  let nlu;
  try {
    nlu = await analyze(fullMessage, {
      model:       config.ollama.model,
      temperature: 0.05,
    });
  } catch (err) {
    console.error('[NLU] analyze() failed:', err.message);
    return _failResult(`ollama-error: ${err.message}`);
  }

  // ── 3. Résolution références implicites ─────────────────
  nlu = resolveImplicitReferences(nlu, text.trim(), callSid);

  // ── 4. Seuil confiance ───────────────────────────────────
  if (nlu.confidence < CONFIDENCE_THRESHOLD && !nlu._resolved) {
    return {
      ok: false, intent: 'unknown', rawIntent: nlu.intent,
      subject: '', date: '', time: '',
      isoDate: null, isoTime: null, iso: null,
      confidence: nlu.confidence, needsClarification: true,
      missing: [], errors: ['low-confidence'], strategy: nlu.strategy,
    };
  }

  // ── 5. Normalisation intent ──────────────────────────────
  const intent = normalizeIntent(nlu.intent);

  // ── 6. Résolution date/heure ─────────────────────────────
  // Si le LLM n'a pas extrait de date (référence implicite), on utilise
  // les entités de la mémoire
  const lastEntities = callSid ? getLastEntities(callSid) : null;
  const rawDate = nlu.date || (lastEntities?.isoDate ?? '');
  const rawTime = nlu.time || (lastEntities?.isoTime ?? '');

  const resolved = resolveDateTime(rawDate, rawTime, referenceDate);
  const missing  = _getMissing(intent, resolved);

  return {
    ok:                 true,
    intent,
    rawIntent:          nlu.intent,
    subject:            nlu.subject ?? '',
    date:               nlu.date    ?? '',
    time:               nlu.time    ?? '',
    isoDate:            resolved.date,
    isoTime:            resolved.time,
    iso:                resolved.iso,
    confidence:         nlu.confidence,
    needsClarification: false,
    missing,
    errors:             nlu.errors ?? [],
    strategy:           nlu.strategy,
    _resolved:          nlu._resolved,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    ok: false, intent: 'unknown', rawIntent: '',
    subject: '', date: '', time: '',
    isoDate: null, isoTime: null, iso: null,
    confidence: 0, needsClarification: false,
    missing: [], errors: [reason], strategy: 'none',
  };
}
