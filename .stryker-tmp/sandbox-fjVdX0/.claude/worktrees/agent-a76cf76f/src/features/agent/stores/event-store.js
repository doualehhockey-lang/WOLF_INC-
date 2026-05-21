// @ts-nocheck
// src/features/agent/stores/event-store.js — Abstract base class for event persistence.
export class EventStore {
  async createEvent(_userKey, _data) {
    throw new Error('Not implemented');
  }

  async listEvents(_userKey) {
    throw new Error('Not implemented');
  }

  async findByDate(_userKey, _date) {
    throw new Error('Not implemented');
  }

  async findBySubject(_userKey, _subjectFragment) {
    throw new Error('Not implemented');
  }

  async updateEvent(_userKey, _eventId, _patch) {
    throw new Error('Not implemented');
  }

  async deleteEvent(_userKey, _eventId) {
    throw new Error('Not implemented');
  }
}
