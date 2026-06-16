// @ts-nocheck
// src/features/agent/agent.service.js — Event dispatch layer.
// Routes to PostgreSQL store (when available) or JSON file store (fallback).
// Records latency and intent counters via Prometheus.

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

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Route a parsed NLU result to the appropriate CRUD handler.
 * @param {import('../nlu/nlu.service.js').NluResult} nluResult
 * @param {string} userKey — tokenized phone or callSid
 * @returns {Promise<{ok:boolean, message:string}>}
 */
export async function dispatch(nluResult, userKey = 'global') {
  const intent  = normalizeIntent(nluResult.intent);
  const timer   = agentLatency.startTimer({ intent });
  let   success = 'true';

  try {
    const result = await _handle({ ...nluResult, intent }, userKey);
    intentCounter.inc({ intent, resolved: result.ok ? 'true' : 'false' });
    return result;
  } catch (err) {
    success = 'false';
    errorCounter.inc({ service: 'agent', errorType: err.code ?? 'unknown' });
    log.error({ err: err.message, intent, userKey }, 'Agent dispatch failed');
    throw err;
  } finally {
    timer({ success });
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function _handle({ intent, subject, isoDate, isoTime, date, time }, userKey) {
  const effectiveDate = isoDate || date;
  const effectiveTime = isoTime || time;

  switch (intent) {
    case 'create_event': {
      if (!effectiveDate)
        return { ok: false, message: "Je n'ai pas la date pour créer le rendez-vous." };
      const event = await store.createEvent(userKey, {
        subject: subject || 'Rendez-vous',
        date:    effectiveDate,
        time:    effectiveTime || '00:00',
      });
      return { ok: true, message: `OK, rendez-vous créé : ${event.subject} le ${event.date} à ${event.time}.` };
    }

    case 'cancel_event': {
      const events = await store.listEvents(userKey);
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à annuler.' };

      let target = effectiveDate ? await store.findEventByDate(userKey, effectiveDate) : null;
      if (!target && subject) target = await store.findEventBySubject(userKey, subject);
      if (!target) target = events[events.length - 1];

      await store.softDeleteEvent(userKey, target.id);
      return { ok: true, message: `Rendez-vous annulé : ${target.subject} le ${target.date} à ${target.time}.` };
    }

    case 'update_event': {
      const events = await store.listEvents(userKey);
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à modifier.' };

      let target = effectiveDate ? await store.findEventByDate(userKey, effectiveDate) : null;
      if (!target && subject) target = await store.findEventBySubject(userKey, subject);
      if (!target) target = events[events.length - 1];

      const patch = {};
      if (effectiveDate) patch.date    = effectiveDate;
      if (effectiveTime) patch.time    = effectiveTime;
      if (subject)       patch.subject = subject;

      const updated = await store.updateEvent(userKey, target.id, patch);
      const ev      = updated ?? target;
      return { ok: true, message: `Rendez-vous mis à jour : ${ev.subject} le ${ev.date} à ${ev.time}.` };
    }

    case 'list_events': {
      const events = await store.listEvents(userKey);
      if (!events.length) return { ok: true, message: "Vous n'avez aucun rendez-vous." };
      const list = events.map(e => `- ${e.subject} le ${e.date} à ${e.time}`).join('\n');
      return { ok: true, message: `Vos rendez-vous :\n${list}` };
    }

    default:
      return { ok: false, message: "Désolé, je n'ai pas compris la commande." };
  }
}
