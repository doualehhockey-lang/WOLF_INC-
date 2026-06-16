// src/features/agent/agent.service.js — Event dispatch layer.
// Routes to PostgreSQL store (when available) or JSON file store (fallback).
// Records latency and intent counters via Prometheus.
<<<<<<< HEAD
// Writes to audit_logs on every dispatch.

import { childLogger } from '../../core/logger.js';
import { agentLatency, intentCounter, errorCounter } from '../../core/metrics.js';
import { dbAvailable } from '../../infra/db/dbClient.js';
import { normalizeIntent } from './intent.normalizer.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { t } from '../../core/i18n.js';
import * as dbStore from './db.store.js';
import * as jsonStore from './json.store.js';

const log = childLogger('agent');

log.info(
  { backend: dbAvailable ? 'postgresql' : 'json' },
  'Agent store initial backend (live-selected per request)'
);
=======

import { childLogger }                          from '../../core/logger.js';
import { agentLatency, intentCounter, errorCounter } from '../../core/metrics.js';
import { dbAvailable }                          from '../../infra/db/dbClient.js';
import { normalizeIntent }                      from './intent.normalizer.js';
import * as dbStore                             from './db.store.js';
import * as jsonStore                           from './json.store.js';

const log = childLogger('agent');

/** Active store — selected once at startup. */
const store = dbAvailable ? dbStore : jsonStore;

log.info({ backend: dbAvailable ? 'postgresql' : 'json' }, 'Agent store selected');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Route a parsed NLU result to the appropriate CRUD handler.
 * @param {import('../nlu/nlu.service.js').NluResult} nluResult
 * @param {string} userKey — tokenized phone or callSid
<<<<<<< HEAD
 * @param {{ phoneNumber?: string, callSid?: string, lang?: string }} ctx
 * @returns {Promise<{ok:boolean, message:string}>}
 */
export async function dispatch(nluResult, userKey = 'global', ctx = {}) {
  const intent = normalizeIntent(nluResult.intent);
  const timer = agentLatency.startTimer({ intent });
  const startedAt = Date.now();
  const lang = ctx.lang ?? 'fr'; // default to French (app origin); callers override via ctx.lang
  let success = 'true';

  try {
    const result = await _handle({ ...nluResult, intent }, userKey, lang);
    intentCounter.inc({ intent, resolved: result.ok ? 'true' : 'false' });

    // Audit log is best-effort — a write failure must NOT corrupt the caller's
    // view of the operation.  The calendar event was already created/cancelled;
    // re-throwing here would cause the voice/SMS pipeline to report an error to
    // the user even though their request succeeded.
    try {
      await writeAuditLog({
        phoneNumber: ctx.phoneNumber,
        callSid: ctx.callSid,
        action: 'agent_dispatch',
        intent,
        requestData: { subject: nluResult.subject, isoDate: nluResult.isoDate },
        responseData: { ok: result.ok },
        status: 'success',
        latencyMs: Date.now() - startedAt,
      });
    } catch (auditErr) {
      log.error(
        { err: auditErr.message, intent },
        'Audit log write failed — calendar operation succeeded'
      );
    }

=======
 * @returns {Promise<{ok:boolean, message:string}>}
 */
export async function dispatch(nluResult, userKey = 'global') {
  const intent  = normalizeIntent(nluResult.intent);
  const timer   = agentLatency.startTimer({ intent });
  let   success = 'true';

  try {
    const result = await _handle({ ...nluResult, intent }, userKey);
    intentCounter.inc({ intent, resolved: result.ok ? 'true' : 'false' });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    return result;
  } catch (err) {
    success = 'false';
    errorCounter.inc({ service: 'agent', errorType: err.code ?? 'unknown' });
    log.error({ err: err.message, intent, userKey }, 'Agent dispatch failed');
<<<<<<< HEAD

    await writeAuditLog({
      phoneNumber: ctx.phoneNumber,
      callSid: ctx.callSid,
      action: 'agent_dispatch',
      intent,
      status: 'error',
      latencyMs: Date.now() - startedAt,
      errorMessage: err.message,
      errorCode: err.code,
    });

=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    throw err;
  } finally {
    timer({ success });
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

<<<<<<< HEAD
async function _handle({ intent, subject, isoDate, isoTime, date, time }, userKey, lang = 'en') {
  // Re-check dbAvailable on every call so the store adapts to live DB state.
  // The import binding is live (ESM let export) — this reflects the current value
  // without incurring a re-import cost on every request.
  const store = dbAvailable ? dbStore : jsonStore;

=======
async function _handle({ intent, subject, isoDate, isoTime, date, time }, userKey) {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const effectiveDate = isoDate || date;
  const effectiveTime = isoTime || time;

  switch (intent) {
    case 'create_event': {
<<<<<<< HEAD
      if (!effectiveDate) return { ok: false, message: t('agent.missing_date', {}, lang) };
      const event = await store.createEvent(userKey, {
        subject: subject || t('agent.event_created', { date: '', time: '' }, lang),
        date: effectiveDate,
        time: effectiveTime || '00:00',
      });
      return {
        ok: true,
        message: t(
          'agent.event_created',
          { subject: event.subject, date: event.date, time: event.time },
          lang
        ),
      };
=======
      if (!effectiveDate)
        return { ok: false, message: "Je n'ai pas la date pour créer le rendez-vous." };
      const event = await store.createEvent(userKey, {
        subject: subject || 'Rendez-vous',
        date:    effectiveDate,
        time:    effectiveTime || '00:00',
      });
      return { ok: true, message: `OK, rendez-vous créé : ${event.subject} le ${event.date} à ${event.time}.` };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    }

    case 'cancel_event': {
      const events = await store.listEvents(userKey);
<<<<<<< HEAD
      if (!events.length) return { ok: true, message: t('agent.no_events', {}, lang) };
=======
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à annuler.' };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

      let target = effectiveDate ? await store.findEventByDate(userKey, effectiveDate) : null;
      if (!target && subject) target = await store.findEventBySubject(userKey, subject);
      if (!target) target = events[events.length - 1];

      await store.softDeleteEvent(userKey, target.id);
<<<<<<< HEAD
      return {
        ok: true,
        message: t(
          'agent.event_cancelled',
          { subject: target.subject, date: target.date, time: target.time },
          lang
        ),
      };
=======
      return { ok: true, message: `Rendez-vous annulé : ${target.subject} le ${target.date} à ${target.time}.` };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    }

    case 'update_event': {
      const events = await store.listEvents(userKey);
<<<<<<< HEAD
      if (!events.length) return { ok: true, message: t('agent.no_events', {}, lang) };
=======
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à modifier.' };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

      let target = effectiveDate ? await store.findEventByDate(userKey, effectiveDate) : null;
      if (!target && subject) target = await store.findEventBySubject(userKey, subject);
      if (!target) target = events[events.length - 1];

      const patch = {};
<<<<<<< HEAD
      if (effectiveDate) patch.date = effectiveDate;
      if (effectiveTime) patch.time = effectiveTime;
      if (subject) patch.subject = subject;

      const updated = await store.updateEvent(userKey, target.id, patch);
      const ev = updated ?? target;
      return {
        ok: true,
        message: t(
          'agent.event_updated',
          { subject: ev.subject, date: ev.date, time: ev.time },
          lang
        ),
      };
=======
      if (effectiveDate) patch.date    = effectiveDate;
      if (effectiveTime) patch.time    = effectiveTime;
      if (subject)       patch.subject = subject;

      const updated = await store.updateEvent(userKey, target.id, patch);
      const ev      = updated ?? target;
      return { ok: true, message: `Rendez-vous mis à jour : ${ev.subject} le ${ev.date} à ${ev.time}.` };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    }

    case 'list_events': {
      const events = await store.listEvents(userKey);
<<<<<<< HEAD
      if (!events.length) return { ok: true, message: t('agent.no_events', {}, lang) };
      const list = events.map(e => `- ${e.subject} ${e.date} ${e.time}`).join('\n');
      return {
        ok: true,
        message: `${t('agent.events_listed', { count: events.length }, lang)}\n${list}`,
      };
    }

    default:
      return { ok: false, message: t('agent.unknown_intent', {}, lang) };
=======
      if (!events.length) return { ok: true, message: "Vous n'avez aucun rendez-vous." };
      const list = events.map(e => `- ${e.subject} le ${e.date} à ${e.time}`).join('\n');
      return { ok: true, message: `Vos rendez-vous :\n${list}` };
    }

    default:
      return { ok: false, message: "Désolé, je n'ai pas compris la commande." };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  }
}
