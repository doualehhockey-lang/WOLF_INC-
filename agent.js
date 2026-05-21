// agent.js — v3
// Business logic + event store.
// Uses PostgreSQL (via event.repository.js) when DB_HOST is configured,
// falls back to async JSON file store otherwise.

import { readFileSync, mkdirSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { config } from './env.js';
import { childLogger } from './utils/logger.js';
import { agentLatency, intentCounter, errorCounter, eventsStoredGauge } from './utils/metrics.js';
import { dbAvailable } from './config/database.js';
import * as eventRepo from './repositories/event.repository.js';

const log = childLogger('agent');

// ── JSON file store (fallback when no DB) ─────────────────────────────────────

const STORE_FILE = resolve(config.agent.eventsFile);

function _ensureDir() {
  const dir = dirname(STORE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function _loadJson() {
  try {
    _ensureDir();
    const { events, counter } = JSON.parse(readFileSync(STORE_FILE, 'utf8'));
    const store = new Map(Object.entries(events ?? {}));
    return { store, counter: counter ?? 1 };
  } catch {
    return { store: new Map(), counter: 1 };
  }
}

let _saveInFlight = false,
  _savePending = false;

async function _saveJson(store, counter) {
  if (_saveInFlight) {
    _savePending = true;
    return;
  }
  _saveInFlight = true;
  _savePending = false;
  try {
    _ensureDir();
    await writeFile(
      STORE_FILE,
      JSON.stringify({ events: Object.fromEntries(store), counter }, null, 2),
      'utf8'
    );
  } catch (err) {
    log.error({ err: err.message }, 'Failed to persist events to JSON');
    errorCounter.inc({ service: 'agent', errorType: 'persist_failed' });
  } finally {
    _saveInFlight = false;
    if (_savePending) _saveJson(store, counter);
  }
}

const { store: _jsonStore, counter: _jsonCounter } = _loadJson();
let _idCounter = _jsonCounter;

const totalJson = [..._jsonStore.values()].reduce((n, a) => n + a.length, 0);
log.info(
  {
    users: _jsonStore.size,
    events: totalJson,
    nextId: _idCounter,
    backend: dbAvailable ? 'postgresql' : 'json',
  },
  'Agent store initialised'
);
if (!dbAvailable) eventsStoredGauge.set(totalJson);

function _getJsonEvents(key) {
  if (!_jsonStore.has(key)) _jsonStore.set(key, []);
  return _jsonStore.get(key);
}

// ── Intent normalization ──────────────────────────────────────────────────────

export function normalizeIntent(intent) {
  if (!intent) return 'unknown';
  const lower = intent.toLowerCase();
  if (/create|new|ajout|ajouter/.test(lower)) return 'create_event';
  if (/cancel|annul|supprim|delete|supprimer/.test(lower)) return 'cancel_event';
  if (/update|modif|change|déplace|deplace/.test(lower)) return 'update_event';
  if (/list|agenda|lister|choix/.test(lower)) return 'list_events';
  return lower;
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export async function dispatch(nluResult, userKey = 'global') {
  const timer = agentLatency.startTimer({ intent: nluResult.intent ?? 'unknown' });
  let success = 'true';

  try {
    const result = dbAvailable
      ? await _dispatchDb(nluResult, userKey)
      : await _dispatchJson(nluResult, userKey);
    intentCounter.inc({
      intent: nluResult.intent ?? 'unknown',
      resolved: result.ok ? 'true' : 'false',
    });
    return result;
  } catch (err) {
    success = 'false';
    errorCounter.inc({ service: 'agent', errorType: err.code ?? 'unknown' });
    log.error({ err: err.message, intent: nluResult.intent, userKey }, 'Agent dispatch failed');
    throw err;
  } finally {
    timer({ success });
  }
}

// ── PostgreSQL dispatch ───────────────────────────────────────────────────────

async function _dispatchDb(nluResult, userKey) {
  const { intent, subject, isoDate, isoTime } = nluResult;

  switch (intent) {
    case 'create_event': {
      if (!isoDate) return { ok: false, message: "Je n'ai pas la date pour créer le rendez-vous." };
      const event = await eventRepo.createEvent(userKey, {
        subject: subject || 'Rendez-vous',
        date: isoDate,
        time: isoTime || '00:00',
      });
      log.info({ userKey, eventId: event.id }, 'Event created (DB)');
      eventsStoredGauge.inc();
      return {
        ok: true,
        message: `OK, rendez-vous créé : ${event.subject} le ${event.date} à ${event.time}.`,
      };
    }

    case 'cancel_event': {
      const events = await eventRepo.listEvents(userKey);
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à annuler.' };

      let target = isoDate ? await eventRepo.findEventByDate(userKey, isoDate) : null;
      if (!target && subject) target = await eventRepo.findEventBySubject(userKey, subject);
      if (!target) target = events[events.length - 1]; // most recent

      await eventRepo.softDeleteEvent(userKey, target.id);
      log.info({ userKey, eventId: target.id }, 'Event cancelled (DB)');
      eventsStoredGauge.dec();
      return {
        ok: true,
        message: `Rendez-vous annulé : ${target.subject} le ${target.date} à ${target.time}.`,
      };
    }

    case 'update_event': {
      const events = await eventRepo.listEvents(userKey);
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à modifier.' };

      let target = isoDate ? await eventRepo.findEventByDate(userKey, isoDate) : null;
      if (!target && subject) target = await eventRepo.findEventBySubject(userKey, subject);
      if (!target) target = events[events.length - 1];

      const patch = {};
      if (isoDate) patch.date = isoDate;
      if (isoTime) patch.time = isoTime;
      if (subject) patch.subject = subject;

      const updated = await eventRepo.updateEvent(userKey, target.id, patch);
      log.info({ userKey, eventId: target.id }, 'Event updated (DB)');
      return {
        ok: true,
        message: `Rendez-vous mis à jour : ${updated.subject} le ${updated.date} à ${updated.time}.`,
      };
    }

    case 'list_events': {
      const events = await eventRepo.listEvents(userKey);
      if (!events.length) return { ok: true, message: "Vous n'avez aucun rendez-vous." };
      const list = events.map(e => `- ${e.subject} le ${e.date} à ${e.time}`).join('\n');
      return { ok: true, message: `Vos rendez-vous :\n${list}` };
    }

    default:
      return { ok: false, message: "Désolé, je n'ai pas compris la commande." };
  }
}

// ── JSON fallback dispatch ────────────────────────────────────────────────────

async function _dispatchJson(nluResult, userKey) {
  const events = _getJsonEvents(userKey);
  const { intent, subject, isoDate, isoTime, date, time } = nluResult;

  switch (intent) {
    case 'create_event': {
      if (!isoDate && !date)
        return { ok: false, message: "Je n'ai pas la date pour créer le rendez-vous." };
      const event = {
        id: _idCounter++,
        subject: subject || 'Rendez-vous',
        date: isoDate || date,
        time: isoTime || time || '00:00',
      };
      events.push(event);
      _saveJson(_jsonStore, _idCounter);
      eventsStoredGauge.inc();
      log.info({ userKey, event }, 'Event created (JSON)');
      return {
        ok: true,
        message: `OK, rendez-vous créé : ${event.subject} le ${event.date} à ${event.time}.`,
      };
    }

    case 'cancel_event': {
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à annuler.' };
      const targetDate = isoDate || date;
      let idx = targetDate ? events.findIndex(e => e.date === targetDate) : -1;
      if (idx === -1 && subject)
        idx = events.findIndex(e => e.subject.toLowerCase().includes(subject.toLowerCase()));
      if (idx === -1) idx = events.length - 1;
      const [removed] = events.splice(idx, 1);
      _saveJson(_jsonStore, _idCounter);
      eventsStoredGauge.dec();
      log.info({ userKey, removed }, 'Event cancelled (JSON)');
      return {
        ok: true,
        message: `Rendez-vous annulé : ${removed.subject} le ${removed.date} à ${removed.time}.`,
      };
    }

    case 'update_event': {
      if (!events.length) return { ok: true, message: 'Aucun rendez-vous à modifier.' };
      const targetDate = isoDate || date;
      let idx = targetDate ? events.findIndex(e => e.date === targetDate) : -1;
      if (idx === -1 && subject)
        idx = events.findIndex(e => e.subject.toLowerCase().includes(subject.toLowerCase()));
      if (idx === -1) idx = events.length - 1;
      const target = events[idx];
      if (isoDate || date) target.date = isoDate || date;
      if (isoTime || time) target.time = isoTime || time;
      if (subject) target.subject = subject;
      _saveJson(_jsonStore, _idCounter);
      log.info({ userKey, target }, 'Event updated (JSON)');
      return {
        ok: true,
        message: `Rendez-vous mis à jour : ${target.subject} le ${target.date} à ${target.time}.`,
      };
    }

    case 'list_events': {
      if (!events.length) return { ok: true, message: "Vous n'avez aucun rendez-vous." };
      const list = events
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
        .map(e => `- ${e.subject} le ${e.date} à ${e.time}`)
        .join('\n');
      return { ok: true, message: `Vos rendez-vous :\n${list}` };
    }

    default:
      return { ok: false, message: "Désolé, je n'ai pas compris la commande." };
  }
}
