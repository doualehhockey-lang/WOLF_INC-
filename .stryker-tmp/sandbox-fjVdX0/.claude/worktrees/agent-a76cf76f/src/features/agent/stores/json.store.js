// @ts-nocheck
// src/features/agent/stores/json.store.js — JSON file-based EventStore with race-free writes.
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { EventStore } from './event-store.js';
import { enqueueWrite } from '../write-queue.js';
import { config } from '../../../core/config.js';
import { childLogger } from '../../../core/logger.js';

const log = childLogger('json.store');
const STORE_FILE = resolve(config.agent.eventsFile);

function _ensureDir() {
  const dir = dirname(STORE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function _load() {
  try {
    _ensureDir();
    const { events, counter } = JSON.parse(readFileSync(STORE_FILE, 'utf8'));
    const store = new Map(Object.entries(events ?? {}));
    return { store, counter: counter ?? 1 };
  } catch {
    return { store: new Map(), counter: 1 };
  }
}

const { store: _jsonStore, counter: _jsonCounter } = _load();
let _idCounter = _jsonCounter;

function _getList(key) {
  if (!_jsonStore.has(key)) _jsonStore.set(key, []);
  return _jsonStore.get(key);
}

async function _persist() {
  await enqueueWrite(STORE_FILE, async () => {
    _ensureDir();
    await writeFile(
      STORE_FILE,
      JSON.stringify({ events: Object.fromEntries(_jsonStore), counter: _idCounter }, null, 2),
      'utf8'
    );
  });
}

export class JsonStore extends EventStore {
  async createEvent(userKey, { subject, date, time }) {
    const events = _getList(userKey);
    const event = { id: _idCounter++, subject: subject || 'Rendez-vous', date, time: time || '00:00' };
    events.push(event);
    await _persist().catch(err => log.error({ err: err.message }, 'JSON persist failed'));
    return event;
  }

  async listEvents(userKey) {
    return [..._getList(userKey)].sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
    );
  }

  async findByDate(userKey, date) {
    return _getList(userKey).find(e => e.date === date) ?? null;
  }

  async findBySubject(userKey, subjectFragment) {
    const lower = subjectFragment.toLowerCase();
    return _getList(userKey).find(e => e.subject.toLowerCase().includes(lower)) ?? null;
  }

  async updateEvent(userKey, eventId, patch) {
    const events = _getList(userKey);
    const idx = events.findIndex(e => e.id === eventId);
    if (idx === -1) return null;
    Object.assign(events[idx], patch);
    await _persist().catch(err => log.error({ err: err.message }, 'JSON persist failed'));
    return events[idx];
  }

  async deleteEvent(userKey, eventId) {
    const events = _getList(userKey);
    const idx = events.findIndex(e => e.id === eventId);
    if (idx !== -1) {
      events.splice(idx, 1);
      await _persist().catch(err => log.error({ err: err.message }, 'JSON persist failed'));
    }
  }
}
