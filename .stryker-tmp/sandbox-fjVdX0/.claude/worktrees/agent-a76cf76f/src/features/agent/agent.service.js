// @ts-nocheck
// src/features/agent/agent.service.js — Event dispatch using injected EventStore.
import { dbAvailable } from '../../infra/db/knex.js';
import { DbStore } from './stores/db.store.js';
import { JsonStore } from './stores/json.store.js';
import { normalizeIntent } from './intent.normalizer.js';
import { childLogger } from '../../core/logger.js';
import { agentLatency, intentCounter, errorCounter, eventsStoredGauge } from '../../core/metrics.js';

const log = childLogger('agent.service');
const store = dbAvailable ? new DbStore() : new JsonStore();

export async function dispatch(nluResult, userKey = 'global') {
  const intent = normalizeIntent(nluResult.intent ?? 'unknown');
  const { subject, isoDate, isoTime, date, time } = nluResult;
  const timer = agentLatency.startTimer({ intent });
  let success = 'true';

  try {
    const result = await _handle(intent, { subject, isoDate, isoTime, date, time }, userKey);
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

async function _handle(intent, { subject, isoDate, isoTime, date, time }, userKey) {
  switch (intent) {
    case 'create_event': {
      if (!isoDate && !date) return { ok: false, message: "Je n'ai pas la date pour créer le rendez-vous." };
      const event = await store.createEvent(userKey, {
        subject: subject || 'Rendez-vous',
        date: isoDate || date,
        time: isoTime || time || '00:00',
      });
      eventsStoredGauge.inc();
      log.info({ userKey, eventId: event.id }, 'Event created');
      return { ok: true, message: `OK, rendez-vous créé : ${event.subject} le ${event.date} à ${event.time}.` };
    }

    case 'cancel_event': {
      const events = await store.listEvents(userKey);
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à annuler.' };
      const targetDate = isoDate || date;
      let target = targetDate ? await store.findByDate(userKey, targetDate) : null;
      if (!target && subject) target = await store.findBySubject(userKey, subject);
      if (!target) target = events[events.length - 1];
      await store.deleteEvent(userKey, target.id);
      eventsStoredGauge.dec();
      log.info({ userKey, eventId: target.id }, 'Event cancelled');
      return { ok: true, message: `Rendez-vous annulé : ${target.subject} le ${target.date} à ${target.time}.` };
    }

    case 'update_event': {
      const events = await store.listEvents(userKey);
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à modifier.' };
      const targetDate = isoDate || date;
      let target = targetDate ? await store.findByDate(userKey, targetDate) : null;
      if (!target && subject) target = await store.findBySubject(userKey, subject);
      if (!target) target = events[events.length - 1];
      const patch = {};
      if (isoDate || date) patch.date = isoDate || date;
      if (isoTime || time) patch.time = isoTime || time;
      if (subject) patch.subject = subject;
      const updated = await store.updateEvent(userKey, target.id, patch);
      log.info({ userKey, eventId: target.id }, 'Event updated');
      return { ok: true, message: `Rendez-vous mis à jour : ${updated.subject} le ${updated.date} à ${updated.time}.` };
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
