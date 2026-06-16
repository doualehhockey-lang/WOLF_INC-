// tests/agent.test.js — Unit tests for agent dispatch logic.
// All external dependencies are mocked — no disk I/O, no DB, no Redis.

import { jest } from '@jest/globals';

// ── Mocks (must come before dynamic imports) ──────────────────────────────────

jest.unstable_mockModule('../env.js', () => ({
  config: {
    agent: { eventsFile: '/tmp/wolf-test-events.json', maxEvents: 500 },
    nodeEnv: 'test',
  },
}));

jest.unstable_mockModule('fs', () => ({
  readFileSync: jest.fn(() => {
    throw new Error('no file');
  }),
  mkdirSync: jest.fn(),
  existsSync: jest.fn(() => false),
}));

jest.unstable_mockModule('fs/promises', () => ({
  writeFile: jest.fn(() => Promise.resolve()),
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  childLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

jest.unstable_mockModule('../utils/metrics.js', () => ({
  agentLatency: { startTimer: jest.fn(() => jest.fn()) },
  intentCounter: { inc: jest.fn() },
  errorCounter: { inc: jest.fn() },
  eventsStoredGauge: { set: jest.fn(), inc: jest.fn(), dec: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
}));

jest.unstable_mockModule('../utils/redis.js', () => ({
  redis: null,
  redisAvailable: false,
  cacheGet: jest.fn(() => Promise.resolve(null)),
  cacheSet: jest.fn(() => Promise.resolve()),
  cacheDel: jest.fn(() => Promise.resolve()),
}));

jest.unstable_mockModule('../config/database.js', () => ({
  db: null,
  dbAvailable: false,
}));

jest.unstable_mockModule('../repositories/event.repository.js', () => ({
  createEvent: jest.fn(),
  listEvents: jest.fn(() => Promise.resolve([])),
  findEventByDate: jest.fn(() => Promise.resolve(null)),
  findEventBySubject: jest.fn(() => Promise.resolve(null)),
  updateEvent: jest.fn(),
  softDeleteEvent: jest.fn(),
}));

// ── Load module under test ────────────────────────────────────────────────────

const { dispatch, normalizeIntent } = await import('../agent.js');

// ═══════════════════════════════════════════════════════════
// normalizeIntent
// ═══════════════════════════════════════════════════════════

describe('normalizeIntent', () => {
  test('maps "create" variants', () => {
    expect(normalizeIntent('create')).toBe('create_event');
    expect(normalizeIntent('ajouter')).toBe('create_event');
    expect(normalizeIntent('new')).toBe('create_event');
  });

  test('maps "cancel" variants', () => {
    expect(normalizeIntent('cancel')).toBe('cancel_event');
    expect(normalizeIntent('annuler')).toBe('cancel_event');
    expect(normalizeIntent('supprimer')).toBe('cancel_event');
  });

  test('maps "update" variants', () => {
    expect(normalizeIntent('update')).toBe('update_event');
    expect(normalizeIntent('modifier')).toBe('update_event');
  });

  test('maps "list" variants', () => {
    expect(normalizeIntent('list')).toBe('list_events');
    expect(normalizeIntent('agenda')).toBe('list_events');
  });

  test('returns unknown for null/empty', () => {
    expect(normalizeIntent(null)).toBe('unknown');
    expect(normalizeIntent('')).toBe('unknown');
  });
});

// ═══════════════════════════════════════════════════════════
// dispatch (JSON fallback — dbAvailable=false)
// ═══════════════════════════════════════════════════════════

describe('dispatch (JSON fallback)', () => {
  let userKey;
  beforeEach(() => {
    userKey = `test-${Math.random().toString(36).slice(2)}`;
  });

  // ── create_event ────────────────────────────────────────

  describe('create_event', () => {
    test('creates event with date and subject', async () => {
      const r = await dispatch(
        {
          intent: 'create_event',
          subject: 'Dentiste',
          isoDate: '2026-06-15',
          isoTime: '14:00',
          confidence: 0.95,
        },
        userKey
      );
      expect(r.ok).toBe(true);
      expect(r.message).toContain('Dentiste');
      expect(r.message).toContain('2026-06-15');
      expect(r.message).toContain('14:00');
    });

    test('uses fallback subject "Rendez-vous" when none given', async () => {
      const r = await dispatch(
        { intent: 'create_event', isoDate: '2026-07-01', isoTime: '09:00', confidence: 0.8 },
        userKey
      );
      expect(r.ok).toBe(true);
      expect(r.message).toContain('Rendez-vous');
    });

    test('returns error when no date', async () => {
      const r = await dispatch(
        { intent: 'create_event', subject: 'Meeting', confidence: 0.7 },
        userKey
      );
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/date/i);
    });

    test('accepts legacy date field', async () => {
      const r = await dispatch(
        { intent: 'create_event', subject: 'Réunion', date: '2026-08-10', confidence: 0.75 },
        userKey
      );
      expect(r.ok).toBe(true);
      expect(r.message).toContain('2026-08-10');
    });
  });

  // ── cancel_event ────────────────────────────────────────

  describe('cancel_event', () => {
    test('no events → friendly message', async () => {
      const r = await dispatch({ intent: 'cancel_event', confidence: 0.9 }, userKey);
      expect(r.ok).toBe(true);
      expect(r.message).toMatch(/aucun/i);
    });

    test('cancels most recent when no date given', async () => {
      await dispatch(
        {
          intent: 'create_event',
          subject: 'Médecin',
          isoDate: '2026-05-20',
          isoTime: '10:00',
          confidence: 0.9,
        },
        userKey
      );
      await dispatch(
        {
          intent: 'create_event',
          subject: 'Dentiste',
          isoDate: '2026-05-21',
          isoTime: '11:00',
          confidence: 0.9,
        },
        userKey
      );
      const r = await dispatch({ intent: 'cancel_event', confidence: 0.9 }, userKey);
      expect(r.ok).toBe(true);
      expect(r.message).toContain('Dentiste');
    });

    test('cancels by date', async () => {
      await dispatch(
        {
          intent: 'create_event',
          subject: 'Coiffeur',
          isoDate: '2026-05-25',
          isoTime: '15:00',
          confidence: 0.9,
        },
        userKey
      );
      const r = await dispatch(
        { intent: 'cancel_event', isoDate: '2026-05-25', confidence: 0.9 },
        userKey
      );
      expect(r.ok).toBe(true);
      expect(r.message).toContain('Coiffeur');
    });
  });

  // ── update_event ────────────────────────────────────────

  describe('update_event', () => {
    test('no events → friendly message', async () => {
      const r = await dispatch({ intent: 'update_event', confidence: 0.9 }, userKey);
      expect(r.ok).toBe(true);
      expect(r.message).toMatch(/aucun/i);
    });

    test('updates time of most recent event', async () => {
      await dispatch(
        {
          intent: 'create_event',
          subject: 'Yoga',
          isoDate: '2026-06-01',
          isoTime: '08:00',
          confidence: 0.9,
        },
        userKey
      );
      const r = await dispatch(
        { intent: 'update_event', isoTime: '09:30', confidence: 0.9 },
        userKey
      );
      expect(r.ok).toBe(true);
      expect(r.message).toContain('09:30');
      expect(r.message).toContain('Yoga');
    });
  });

  // ── list_events ─────────────────────────────────────────

  describe('list_events', () => {
    test('no events → friendly message', async () => {
      const r = await dispatch({ intent: 'list_events', confidence: 0.9 }, userKey);
      expect(r.ok).toBe(true);
      expect(r.message).toMatch(/aucun/i);
    });

    test('lists events sorted by date asc', async () => {
      await dispatch(
        {
          intent: 'create_event',
          subject: 'B',
          isoDate: '2026-07-02',
          isoTime: '10:00',
          confidence: 0.9,
        },
        userKey
      );
      await dispatch(
        {
          intent: 'create_event',
          subject: 'A',
          isoDate: '2026-07-01',
          isoTime: '09:00',
          confidence: 0.9,
        },
        userKey
      );
      const r = await dispatch({ intent: 'list_events', confidence: 0.9 }, userKey);
      expect(r.ok).toBe(true);
      expect(r.message.indexOf('A')).toBeLessThan(r.message.indexOf('B'));
    });
  });

  // ── unknown ──────────────────────────────────────────────

  test('unknown intent → ok:false', async () => {
    const r = await dispatch({ intent: 'unknown', confidence: 0.1 }, userKey);
    expect(r.ok).toBe(false);
  });
});
