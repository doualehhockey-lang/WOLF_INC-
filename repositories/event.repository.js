// repositories/event.repository.js
// Data access layer for events — wraps Knex queries.
// Used by agent.js when PostgreSQL is available (DB_HOST is set).

import { db } from '../config/database.js';
import { childLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';

const log = childLogger('event.repository');

// Ensure a user row exists (upsert) before inserting events (FK constraint)
async function _ensureUser(phoneNumber) {
  await db('users').insert({ phone_number: phoneNumber }).onConflict('phone_number').ignore();
}

export async function createEvent(phoneNumber, { subject, date, time, description }) {
  try {
    await _ensureUser(phoneNumber);
    const [event] = await db('events')
      .insert({ phone_number: phoneNumber, subject, date, time, description })
      .returning('*');
    log.debug({ phoneNumber, event }, 'Event created in DB');
    return event;
  } catch (err) {
    throw new DatabaseError(err.message, { phoneNumber, subject });
  }
}

export async function listEvents(phoneNumber) {
  try {
    return await db('events')
      .where({ phone_number: phoneNumber, deleted_at: null })
      .orderBy('date', 'asc')
      .orderBy('time', 'asc');
  } catch (err) {
    throw new DatabaseError(err.message, { phoneNumber });
  }
}

export async function findEventByDate(phoneNumber, date) {
  try {
    return await db('events').where({ phone_number: phoneNumber, date, deleted_at: null }).first();
  } catch (err) {
    throw new DatabaseError(err.message, { phoneNumber, date });
  }
}

export async function findEventBySubject(phoneNumber, subjectFragment) {
  try {
    return await db('events')
      .where({ phone_number: phoneNumber, deleted_at: null })
      .whereILike('subject', `%${subjectFragment}%`)
      .first();
  } catch (err) {
    throw new DatabaseError(err.message, { phoneNumber, subjectFragment });
  }
}

export async function updateEvent(phoneNumber, eventId, patch) {
  try {
    const [event] = await db('events')
      .where({ phone_number: phoneNumber, id: eventId, deleted_at: null })
      .update({ ...patch, updated_at: db.fn.now() })
      .returning('*');
    return event ?? null;
  } catch (err) {
    throw new DatabaseError(err.message, { phoneNumber, eventId });
  }
}

export async function softDeleteEvent(phoneNumber, eventId) {
  try {
    await db('events')
      .where({ phone_number: phoneNumber, id: eventId })
      .update({ deleted_at: db.fn.now() });
  } catch (err) {
    throw new DatabaseError(err.message, { phoneNumber, eventId });
  }
}

export async function countEvents(phoneNumber) {
  try {
    const [{ count }] = await db('events')
      .where({ phone_number: phoneNumber, deleted_at: null })
      .count('* as count');
    return Number(count);
  } catch (err) {
    throw new DatabaseError(err.message, { phoneNumber });
  }
}
