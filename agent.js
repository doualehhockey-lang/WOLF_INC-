// agent.js — business logic + disk-persisted event store
// Events keyed by phone number (From) — survive server restarts.
// idCounter also persisted so IDs are never duplicated.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { config } from './env.js';

// ── Persistence ──────────────────────────────────────────────────────────────

const STORE_FILE = resolve(config.agent.eventsFile);

function _ensureDir() {
  const dir = dirname(STORE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function _load() {
  try {
    _ensureDir();
    const raw = readFileSync(STORE_FILE, 'utf8');
    const { events, counter } = JSON.parse(raw);
    // Restore Map from serialized { phone: [...events] } object
    const store = new Map(Object.entries(events ?? {}));
    return { store, counter: counter ?? 1 };
  } catch {
    return { store: new Map(), counter: 1 };
  }
}

function _save(store, counter) {
  try {
    _ensureDir();
    const events = Object.fromEntries(store);
    writeFileSync(STORE_FILE, JSON.stringify({ events, counter }, null, 2), 'utf8');
  } catch (err) {
    console.error('[Agent] Failed to persist events:', err.message);
  }
}

const { store: eventsStore, counter: _loaded } = _load();
let idCounter = _loaded;

console.log(`[Agent] Loaded ${eventsStore.size} user(s) from disk (next id: ${idCounter})`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEvents(key) {
  if (!eventsStore.has(key)) eventsStore.set(key, []);
  return eventsStore.get(key);
}

// ── Intent normalization ──────────────────────────────────────────────────────

export function normalizeIntent(intent) {
  if (!intent) return 'unknown';
  const lower = intent.toLowerCase();
  if (/create|new|ajout|ajouter/.test(lower))        return 'create_event';
  if (/cancel|annul|supprim|delete|supprimer/.test(lower)) return 'cancel_event';
  if (/update|modif|change|déplace|deplace/.test(lower))   return 'update_event';
  if (/list|agenda|lister|choix/.test(lower))         return 'list_events';
  return lower;
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export async function dispatch(nluResult, userKey = 'global') {
  const events = getEvents(userKey);
  const { intent, subject, isoDate, isoTime, date, time } = nluResult;

  switch (intent) {
    case 'create_event': {
      if (!isoDate && !date)
        return { ok: false, message: "Je n'ai pas la date pour créer le rendez-vous." };

      const event = {
        id:      idCounter++,
        subject: subject || 'Rendez-vous',
        date:    isoDate || date,
        time:    isoTime || time || '00:00',
      };
      events.push(event);
      _save(eventsStore, idCounter);
      return { ok: true, message: `OK, rendez-vous créé : ${event.subject} le ${event.date} à ${event.time}.` };
    }

    case 'cancel_event': {
      if (events.length === 0)
        return { ok: true, message: 'Aucun rendez-vous à annuler.' };

      const targetDate = isoDate || date;
      let idx = targetDate ? events.findIndex(e => e.date === targetDate) : -1;
      if (idx === -1 && subject) {
        const s = subject.toLowerCase();
        idx = events.findIndex(e => e.subject.toLowerCase().includes(s));
      }
      if (idx === -1) idx = events.length - 1; // fallback: most recent

      const [removed] = events.splice(idx, 1);
      _save(eventsStore, idCounter);
      return { ok: true, message: `Rendez-vous annulé : ${removed.subject} le ${removed.date} à ${removed.time}.` };
    }

    case 'update_event': {
      if (events.length === 0)
        return { ok: true, message: 'Aucun rendez-vous à modifier.' };

      const targetDate = isoDate || date;
      let idx = targetDate ? events.findIndex(e => e.date === targetDate) : -1;
      if (idx === -1 && subject) {
        const s = subject.toLowerCase();
        idx = events.findIndex(e => e.subject.toLowerCase().includes(s));
      }
      if (idx === -1) idx = events.length - 1; // fallback: most recent

      const target = events[idx];
      if (isoDate || date) target.date    = isoDate || date;
      if (isoTime || time) target.time    = isoTime || time;
      if (subject)         target.subject = subject;
      _save(eventsStore, idCounter);
      return { ok: true, message: `Rendez-vous mis à jour : ${target.subject} le ${target.date} à ${target.time}.` };
    }

    case 'list_events': {
      if (events.length === 0)
        return { ok: true, message: "Vous n'avez aucun rendez-vous." };

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
