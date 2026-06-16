// src/features/agent/db.store.js — PostgreSQL-backed event store via Knex.
// Only active when DB_HOST is configured and dbAvailable is true.
// All functions mirror json.store.js API for transparent swap.

<<<<<<< HEAD
import { childLogger } from '../../core/logger.js';
import { db } from '../../infra/db/dbClient.js';
import { eventsStoredGauge } from '../../core/metrics.js';
=======
import { childLogger }                     from '../../core/logger.js';
import { db }                              from '../../infra/db/dbClient.js';
import { eventsStoredGauge, errorCounter } from '../../core/metrics.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

const log = childLogger('db-store');

const TABLE = 'events';

// ── Public API ────────────────────────────────────────────────────────────────

export async function listEvents(userKey) {
  return db(TABLE)
    .where({ user_key: userKey, deleted_at: null })
<<<<<<< HEAD
    .orderBy([
      { column: 'date', order: 'asc' },
      { column: 'time', order: 'asc' },
    ])
=======
    .orderBy([{ column: 'date', order: 'asc' }, { column: 'time', order: 'asc' }])
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    .select('id', 'subject', 'date', 'time');
}

export async function createEvent(userKey, { subject, date, time }) {
  const [event] = await db(TABLE)
    .insert({ user_key: userKey, subject: subject || 'Rendez-vous', date, time })
    .returning(['id', 'subject', 'date', 'time']);
  eventsStoredGauge.inc();
  log.info({ userKey, eventId: event.id }, 'Event created (DB)');
  return event;
}

export async function findEventByDate(userKey, date) {
<<<<<<< HEAD
  return (
    db(TABLE)
      .where({ user_key: userKey, date, deleted_at: null })
      .first('id', 'subject', 'date', 'time') ?? null
  );
}

export async function findEventBySubject(userKey, subject) {
  return (
    db(TABLE)
      .where({ user_key: userKey, deleted_at: null })
      .whereILike('subject', `%${subject.replace(/[%_]/g, '\\$&')}%`)
      .first('id', 'subject', 'date', 'time') ?? null
  );
=======
  return db(TABLE)
    .where({ user_key: userKey, date, deleted_at: null })
    .first('id', 'subject', 'date', 'time') ?? null;
}

export async function findEventBySubject(userKey, subject) {
  return db(TABLE)
    .where({ user_key: userKey, deleted_at: null })
    .whereILike('subject', `%${subject}%`)
    .first('id', 'subject', 'date', 'time') ?? null;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}

export async function softDeleteEvent(userKey, id) {
  const count = await db(TABLE)
    .where({ id, user_key: userKey, deleted_at: null })
    .update({ deleted_at: db.fn.now() });
  if (count) {
    eventsStoredGauge.dec();
    log.info({ userKey, eventId: id }, 'Event soft-deleted (DB)');
  }
  return count > 0;
}

export async function updateEvent(userKey, id, patch) {
  const allowed = {};
<<<<<<< HEAD
  if (patch.date) allowed.date = patch.date;
  if (patch.time) allowed.time = patch.time;
=======
  if (patch.date)    allowed.date    = patch.date;
  if (patch.time)    allowed.time    = patch.time;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  if (patch.subject) allowed.subject = patch.subject;

  const [updated] = await db(TABLE)
    .where({ id, user_key: userKey, deleted_at: null })
    .update({ ...allowed, updated_at: db.fn.now() })
    .returning(['id', 'subject', 'date', 'time']);

  if (updated) log.info({ userKey, eventId: id }, 'Event updated (DB)');
  return updated ?? null;
}

export async function getTotalCount() {
  const [{ count }] = await db(TABLE).whereNull('deleted_at').count('id as count');
  return Number(count);
}
