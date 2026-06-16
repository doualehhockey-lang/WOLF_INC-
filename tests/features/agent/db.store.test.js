// tests/features/agent/db.store.test.js
// PostgreSQL event store: all CRUD operations, gauge increments/decrements,
// null returns for missing records, getTotalCount.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockGaugeInc = jest.fn();
const mockGaugeDec = jest.fn();
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  eventsStoredGauge: { inc: mockGaugeInc, dec: mockGaugeDec, set: jest.fn() },
<<<<<<< HEAD
  errorCounter: { inc: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
=======
  errorCounter:      { inc: jest.fn() },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Build a chainable Knex mock builder ───────────────────────────────────────
// Each method returns `this` so chaining works; terminal methods are promises.
function makeBuilder(terminalResult) {
  const b = {
<<<<<<< HEAD
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereILike: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(terminalResult ?? []),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(terminalResult ?? []),
    update: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(terminalResult ?? null),
    count: jest.fn().mockResolvedValue(terminalResult ?? [{ count: '0' }]),
=======
    where:     jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereILike: jest.fn().mockReturnThis(),
    orderBy:   jest.fn().mockReturnThis(),
    select:    jest.fn().mockResolvedValue(terminalResult ?? []),
    insert:    jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(terminalResult ?? []),
    update:    jest.fn().mockReturnThis(),
    first:     jest.fn().mockResolvedValue(terminalResult ?? null),
    count:     jest.fn().mockResolvedValue(terminalResult ?? [{ count: '0' }]),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  };
  return b;
}

let _builder;
const mockDb = jest.fn(() => _builder);
mockDb.fn = { now: jest.fn(() => 'NOW()') };

jest.unstable_mockModule('../../../src/infra/db/dbClient.js', () => ({
<<<<<<< HEAD
  db: mockDb,
  dbAvailable: true,
  pendingMigrationCount: 0,
=======
  db:          mockDb,
  dbAvailable: true,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const {
<<<<<<< HEAD
  listEvents,
  createEvent,
  findEventByDate,
  findEventBySubject,
  softDeleteEvent,
  updateEvent,
  getTotalCount,
} = await import('../../../src/features/agent/db.store.js');

const EVT = { id: 1, subject: 'Médecin', date: '2026-06-01', time: '09:00' };
const USER = 'user-key-42';
=======
  listEvents, createEvent, findEventByDate, findEventBySubject,
  softDeleteEvent, updateEvent, getTotalCount,
} = await import('../../../src/features/agent/db.store.js');

const EVT    = { id: 1, subject: 'Médecin', date: '2026-06-01', time: '09:00' };
const USER   = 'user-key-42';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

beforeEach(() => {
  jest.clearAllMocks();
  _builder = makeBuilder([EVT]); // default: returns array with one event
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. listEvents
// ═════════════════════════════════════════════════════════════════════════════

describe('listEvents', () => {
  test('queries events table with user_key and deleted_at null', async () => {
    await listEvents(USER);
    expect(mockDb).toHaveBeenCalledWith('events');
    expect(_builder.where).toHaveBeenCalledWith({ user_key: USER, deleted_at: null });
  });

  test('orders by date asc, time asc', async () => {
    await listEvents(USER);
    expect(_builder.orderBy).toHaveBeenCalledWith([
      { column: 'date', order: 'asc' },
      { column: 'time', order: 'asc' },
    ]);
  });

  test('selects id, subject, date, time', async () => {
    await listEvents(USER);
    expect(_builder.select).toHaveBeenCalledWith('id', 'subject', 'date', 'time');
  });

  test('returns array from query', async () => {
    _builder.select.mockResolvedValue([EVT]);
    const result = await listEvents(USER);
    expect(result).toEqual([EVT]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. createEvent
// ═════════════════════════════════════════════════════════════════════════════

describe('createEvent', () => {
  beforeEach(() => {
    _builder = makeBuilder([EVT]);
    _builder.returning.mockResolvedValue([EVT]);
  });

  test('inserts into events table', async () => {
    await createEvent(USER, { subject: 'Médecin', date: '2026-06-01', time: '09:00' });
    expect(_builder.insert).toHaveBeenCalledWith({
<<<<<<< HEAD
      user_key: USER,
      subject: 'Médecin',
      date: '2026-06-01',
      time: '09:00',
=======
      user_key: USER, subject: 'Médecin', date: '2026-06-01', time: '09:00',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });
  });

  test('uses "Rendez-vous" when subject is falsy', async () => {
    await createEvent(USER, { subject: '', date: '2026-06-01', time: '09:00' });
<<<<<<< HEAD
    expect(_builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Rendez-vous' })
    );
=======
    expect(_builder.insert).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Rendez-vous' }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('returns the inserted event', async () => {
    const result = await createEvent(USER, { subject: 'Test', date: '2026-06-01', time: '09:00' });
    expect(result).toEqual(EVT);
  });

  test('increments eventsStoredGauge', async () => {
    await createEvent(USER, { subject: 'Test', date: '2026-06-01', time: '09:00' });
    expect(mockGaugeInc).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. findEventByDate
// ═════════════════════════════════════════════════════════════════════════════

describe('findEventByDate', () => {
  test('queries with user_key and date', async () => {
    _builder.first.mockResolvedValue(EVT);
    await findEventByDate(USER, '2026-06-01');
<<<<<<< HEAD
    expect(_builder.where).toHaveBeenCalledWith({
      user_key: USER,
      date: '2026-06-01',
      deleted_at: null,
    });
=======
    expect(_builder.where).toHaveBeenCalledWith({ user_key: USER, date: '2026-06-01', deleted_at: null });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('returns event when found', async () => {
    _builder.first.mockResolvedValue(EVT);
    const result = await findEventByDate(USER, '2026-06-01');
    expect(result).toEqual(EVT);
  });

  test('returns null when not found (first returns undefined)', async () => {
    _builder.first.mockResolvedValue(undefined);
    const result = await findEventByDate(USER, '2026-12-31');
    expect(result ?? null).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. findEventBySubject
// ═════════════════════════════════════════════════════════════════════════════

describe('findEventBySubject', () => {
  test('uses whereILike with % wildcard pattern', async () => {
    _builder.first.mockResolvedValue(EVT);
    await findEventBySubject(USER, 'méd');
    expect(_builder.whereILike).toHaveBeenCalledWith('subject', '%méd%');
  });

  test('returns null when not found', async () => {
    _builder.first.mockResolvedValue(undefined);
    const result = await findEventBySubject(USER, 'unknown');
    expect(result ?? null).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. softDeleteEvent
// ═════════════════════════════════════════════════════════════════════════════

describe('softDeleteEvent', () => {
  test('returns true when a row was updated (count > 0)', async () => {
    _builder.update.mockResolvedValue(1);
    const result = await softDeleteEvent(USER, 1);
    expect(result).toBe(true);
  });

  test('returns false when no row was updated (count = 0)', async () => {
    _builder.update.mockResolvedValue(0);
    const result = await softDeleteEvent(USER, 999);
    expect(result).toBe(false);
  });

  test('decrements gauge when deletion succeeds', async () => {
    _builder.update.mockResolvedValue(1);
    await softDeleteEvent(USER, 1);
    expect(mockGaugeDec).toHaveBeenCalledTimes(1);
  });

  test('does NOT decrement gauge when deletion finds nothing', async () => {
    _builder.update.mockResolvedValue(0);
    await softDeleteEvent(USER, 999);
    expect(mockGaugeDec).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. updateEvent
// ═════════════════════════════════════════════════════════════════════════════

describe('updateEvent', () => {
  test('returns updated event on success', async () => {
    const updated = { ...EVT, time: '15:00' };
    _builder.returning.mockResolvedValue([updated]);
    const result = await updateEvent(USER, 1, { time: '15:00' });
    expect(result).toEqual(updated);
  });

  test('returns null when no row matched', async () => {
    _builder.returning.mockResolvedValue([]);
    const result = await updateEvent(USER, 999, { time: '15:00' });
    expect(result).toBeNull();
  });

  test('only includes allowed fields in patch (date/time/subject)', async () => {
    _builder.returning.mockResolvedValue([EVT]);
<<<<<<< HEAD
    await updateEvent(USER, 1, {
      date: '2026-07-01',
      time: '10:00',
      subject: 'Kiné',
      extra: 'ignored',
    });
    expect(_builder.update).toHaveBeenCalledWith(expect.not.objectContaining({ extra: 'ignored' }));
    expect(_builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-07-01', time: '10:00', subject: 'Kiné' })
    );
=======
    await updateEvent(USER, 1, { date: '2026-07-01', time: '10:00', subject: 'Kiné', extra: 'ignored' });
    expect(_builder.update).toHaveBeenCalledWith(expect.not.objectContaining({ extra: 'ignored' }));
    expect(_builder.update).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-07-01', time: '10:00', subject: 'Kiné' }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. getTotalCount
// ═════════════════════════════════════════════════════════════════════════════

describe('getTotalCount', () => {
  test('returns numeric count from DB', async () => {
    _builder.count.mockResolvedValue([{ count: '42' }]);
    const result = await getTotalCount();
    expect(result).toBe(42);
  });

  test('queries only non-deleted rows (whereNull deleted_at)', async () => {
    _builder.count.mockResolvedValue([{ count: '0' }]);
    await getTotalCount();
    expect(_builder.whereNull).toHaveBeenCalledWith('deleted_at');
  });
});
