// src/features/agent/json.store.js — JSON file-based event store (dev / no-DB fallback).
// Uses WriteQueue to prevent concurrent writes and data loss.
// All mutations are atomic within a single Node.js process.

import { readFileSync, mkdirSync, existsSync } from 'fs';
import { writeFile }                            from 'fs/promises';
import { resolve, dirname }                     from 'path';
import { childLogger }                          from '../../core/logger.js';
import { config }                               from '../../core/config.js';
import { eventsStoredGauge, errorCounter }      from '../../core/metrics.js';
import { WriteQueue }                           from './write-queue.js';

const log = childLogger('json-store');

const STORE_FILE = resolve(config.EVENTS_FILE);
const MAX_EVENTS = config.MAX_EVENTS;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function _ensureDir() {
  const dir = dirname(STORE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function _load() {
  try {
    _ensureDir();
    const { events = {}, counter = 1 } = JSON.parse(readFileSync(STORE_FILE, 'utf8'));
    return { store: new Map(Object.entries(events)), counter };
  } catch {
    return { store: new Map(), counter: 1 };
  }
}

const { store: _store, counter: _startCounter } = _load();
let _counter = _startCounter;

const _queue = new WriteQueue(async () => {
  _ensureDir();
  await writeFile(
    STORE_FILE,
    JSON.stringify({ events: Object.fromEntries(_store), counter: _counter }, null, 2),
    'utf8'
  );
}, 'json-store');

// Initialise gauge
const total = [..._store.values()].reduce((n, a) => n + a.length, 0);
eventsStoredGauge.set(total);

log.info({ users: _store.size, events: total, nextId: _counter }, 'JSON store loaded');

// ── Helpers ───────────────────────────────────────────────────────────────────

function _userEvents(userKey) {
  if (!_store.has(userKey)) _store.set(userKey, []);
  return _store.get(userKey);
}

function _save() {
  return _queue.enqueue().catch(err => {
    log.error({ err: err.message }, 'JSON store save error');
    errorCounter.inc({ service: 'agent', errorType: 'persist_failed' });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listEvents(userKey) {
  return [...(_userEvents(userKey))].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );
}

export async function createEvent(userKey, { subject, date, time }) {
  const events = _userEvents(userKey);
  const event = { id: _counter++, subject: subject || 'Rendez-vous', date, time };
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  eventsStoredGauge.inc();
  await _save();
  log.info({ userKey, eventId: event.id }, 'Event created (JSON)');
  return event;
}

export async function findEventByDate(userKey, date) {
  return _userEvents(userKey).find(e => e.date === date) ?? null;
}

export async function findEventBySubject(userKey, subject) {
  const lower = subject.toLowerCase();
  return _userEvents(userKey).find(e => e.subject.toLowerCase().includes(lower)) ?? null;
}

export async function softDeleteEvent(userKey, id) {
  const events = _userEvents(userKey);
  const idx    = events.findIndex(e => e.id === id);
  if (idx === -1) return null;
  const [removed] = events.splice(idx, 1);
  eventsStoredGauge.dec();
  await _save();
  log.info({ userKey, eventId: id }, 'Event deleted (JSON)');
  return removed;
}

export async function updateEvent(userKey, id, patch) {
  const events = _userEvents(userKey);
  const target = events.find(e => e.id === id);
  if (!target) return null;
  Object.assign(target, patch);
  await _save();
  log.info({ userKey, eventId: id }, 'Event updated (JSON)');
  return target;
}

export async function getTotalCount() {
  return [..._store.values()].reduce((n, a) => n + a.length, 0);
}
