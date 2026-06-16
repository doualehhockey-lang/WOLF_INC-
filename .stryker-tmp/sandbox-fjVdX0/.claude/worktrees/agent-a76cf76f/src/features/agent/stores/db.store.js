// @ts-nocheck
// src/features/agent/stores/db.store.js — PostgreSQL-backed EventStore implementation.
import { createHash } from 'crypto';
import { EventStore } from './event-store.js';
import * as eventRepo from '../../../repositories/event.repository.js';
import { config } from '../../../core/config.js';

function tokenizePhone(phone) {
  return createHash('sha256')
    .update(phone + config.PHONE_SALT)
    .digest('hex');
}

export class DbStore extends EventStore {
  async createEvent(userKey, data) {
    const token = tokenizePhone(userKey);
    return eventRepo.createEvent(token, data);
  }

  async listEvents(userKey) {
    const token = tokenizePhone(userKey);
    return eventRepo.listEvents(token);
  }

  async findByDate(userKey, date) {
    const token = tokenizePhone(userKey);
    return eventRepo.findEventByDate(token, date);
  }

  async findBySubject(userKey, subjectFragment) {
    const token = tokenizePhone(userKey);
    return eventRepo.findEventBySubject(token, subjectFragment);
  }

  async updateEvent(userKey, eventId, patch) {
    const token = tokenizePhone(userKey);
    return eventRepo.updateEvent(token, eventId, patch);
  }

  async deleteEvent(userKey, eventId) {
    const token = tokenizePhone(userKey);
    return eventRepo.softDeleteEvent(token, eventId);
  }
}
