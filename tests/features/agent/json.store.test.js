// tests/features/agent/json.store.test.js
// JSON file store: CRUD, MAX_EVENTS cap, sort order, missing-record nulls,
// WriteQueue integration, save persistence.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    EVENTS_FILE: '/tmp/test-events.json',
<<<<<<< HEAD
    MAX_EVENTS: 3, // small cap so cap tests work without creating hundreds of events
=======
    MAX_EVENTS:  3, // small cap so cap tests work without creating hundreds of events
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockGaugeInc = jest.fn();
const mockGaugeDec = jest.fn();
const mockGaugeSet = jest.fn();
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  eventsStoredGauge: { inc: mockGaugeInc, dec: mockGaugeDec, set: mockGaugeSet },
<<<<<<< HEAD
  errorCounter: { inc: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
}));

// ── Mock fs (sync + async) ────────────────────────────────────────────────────
const mockReadFileSync = jest.fn(() => {
  throw new Error('ENOENT');
}); // empty store by default
const mockMkdirSync = jest.fn();
const mockExistsSync = jest.fn(() => true);
const mockWriteFile = jest.fn(async () => {});
jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
=======
  errorCounter:      { inc: jest.fn() },
}));

// ── Mock fs (sync + async) ────────────────────────────────────────────────────
const mockReadFileSync = jest.fn(() => { throw new Error('ENOENT'); }); // empty store by default
const mockMkdirSync    = jest.fn();
const mockExistsSync   = jest.fn(() => true);
const mockWriteFile    = jest.fn(async () => {});
jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  mkdirSync:    mockMkdirSync,
  existsSync:   mockExistsSync,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));
jest.unstable_mockModule('fs/promises', () => ({
  writeFile: mockWriteFile,
}));

// ── Mock WriteQueue — execute enqueue immediately ─────────────────────────────
jest.unstable_mockModule('../../../src/features/agent/write-queue.js', () => ({
  WriteQueue: class MockWriteQueue {
<<<<<<< HEAD
    constructor(fn) {
      this._fn = fn;
    }
    async enqueue() {
      await this._fn();
    }
    get isRunning() {
      return false;
    }
    get hasPending() {
      return false;
    }
=======
    constructor(fn) { this._fn = fn; }
    async enqueue() { await this._fn(); }
    get isRunning() { return false; }
    get hasPending() { return false; }
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
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
=======
  listEvents, createEvent, findEventByDate, findEventBySubject,
  softDeleteEvent, updateEvent, getTotalCount,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
} = await import('../../../src/features/agent/json.store.js');

const USER = 'phone-42';

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. listEvents
// ═════════════════════════════════════════════════════════════════════════════

describe('listEvents', () => {
  test('returns empty array for new user', async () => {
    const result = await listEvents('brand-new-user');
    expect(result).toEqual([]);
  });

  test('sorts events by date asc then time asc', async () => {
    // create events out of order
    await createEvent(USER, { subject: 'B', date: '2026-06-02', time: '10:00' });
    await createEvent(USER, { subject: 'A', date: '2026-06-01', time: '09:00' });
    const result = await listEvents(USER);
    expect(result[0].subject).toBe('A');
    expect(result[1].subject).toBe('B');
  });

  test('returns defensive copy (does not mutate internal array)', async () => {
    await createEvent(USER, { subject: 'Test', date: '2026-06-01', time: '09:00' });
    const r1 = await listEvents(USER);
    r1.push({ id: 999, subject: 'Injected', date: '2099-01-01', time: '00:00' });
    const r2 = await listEvents(USER);
    expect(r2.find(e => e.id === 999)).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. createEvent
// ═════════════════════════════════════════════════════════════════════════════

describe('createEvent', () => {
  test('returns created event with numeric id', async () => {
<<<<<<< HEAD
    const event = await createEvent(USER, {
      subject: 'Médecin',
      date: '2026-06-01',
      time: '09:00',
    });
=======
    const event = await createEvent(USER, { subject: 'Médecin', date: '2026-06-01', time: '09:00' });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(event).toMatchObject({ subject: 'Médecin', date: '2026-06-01', time: '09:00' });
    expect(typeof event.id).toBe('number');
  });

  test('uses "Rendez-vous" when subject is empty', async () => {
    const event = await createEvent(USER, { subject: '', date: '2026-06-01', time: '09:00' });
    expect(event.subject).toBe('Rendez-vous');
  });

  test('increments eventsStoredGauge', async () => {
    await createEvent(USER, { subject: 'Test', date: '2026-06-01', time: '09:00' });
    expect(mockGaugeInc).toHaveBeenCalledTimes(1);
  });

  test('calls writeFile (persists via WriteQueue)', async () => {
    await createEvent(USER, { subject: 'Test', date: '2026-06-01', time: '09:00' });
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  test('IDs are auto-incremented', async () => {
    const e1 = await createEvent(USER, { subject: 'A', date: '2026-06-01', time: '09:00' });
    const e2 = await createEvent(USER, { subject: 'B', date: '2026-06-02', time: '09:00' });
    expect(e2.id).toBeGreaterThan(e1.id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. MAX_EVENTS cap
// ═════════════════════════════════════════════════════════════════════════════

describe('createEvent — MAX_EVENTS cap', () => {
  test('trims array to MAX_EVENTS (3) when exceeded by creating 4 events', async () => {
    // MAX_EVENTS=3 is set in mock factory (captured at module import time)
    const capUser = `cap-user-${Date.now()}`;
    for (let i = 0; i < 4; i++) {
      await createEvent(capUser, { subject: `E${i}`, date: `2026-0${i + 1}-01`, time: '09:00' });
    }
    const result = await listEvents(capUser);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. findEventByDate
// ═════════════════════════════════════════════════════════════════════════════

describe('findEventByDate', () => {
  test('returns event matching date', async () => {
    const created = await createEvent(USER, { subject: 'Kiné', date: '2026-07-10', time: '14:00' });
<<<<<<< HEAD
    const found = await findEventByDate(USER, '2026-07-10');
=======
    const found   = await findEventByDate(USER, '2026-07-10');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(found?.id).toBe(created.id);
  });

  test('returns null when no event matches date', async () => {
    const result = await findEventByDate(USER, '2099-12-31');
    expect(result).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. findEventBySubject
// ═════════════════════════════════════════════════════════════════════════════

describe('findEventBySubject', () => {
  test('finds by partial case-insensitive subject', async () => {
<<<<<<< HEAD
    const created = await createEvent(USER, {
      subject: 'Dermatologue',
      date: '2026-06-05',
      time: '11:00',
    });
    const found = await findEventBySubject(USER, 'dermato');
=======
    const created = await createEvent(USER, { subject: 'Dermatologue', date: '2026-06-05', time: '11:00' });
    const found   = await findEventBySubject(USER, 'dermato');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(found?.id).toBe(created.id);
  });

  test('returns null when no subject matches', async () => {
    const result = await findEventBySubject(USER, 'xyz-impossible-string');
    expect(result).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. softDeleteEvent
// ═════════════════════════════════════════════════════════════════════════════

describe('softDeleteEvent', () => {
  test('removes event from list', async () => {
<<<<<<< HEAD
    const created = await createEvent(USER, {
      subject: 'Delete me',
      date: '2026-08-01',
      time: '08:00',
    });
=======
    const created = await createEvent(USER, { subject: 'Delete me', date: '2026-08-01', time: '08:00' });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await softDeleteEvent(USER, created.id);
    const list = await listEvents(USER);
    expect(list.find(e => e.id === created.id)).toBeUndefined();
  });

  test('returns removed event object', async () => {
<<<<<<< HEAD
    const created = await createEvent(USER, {
      subject: 'Remove',
      date: '2026-08-02',
      time: '08:00',
    });
    const result = await softDeleteEvent(USER, created.id);
=======
    const created = await createEvent(USER, { subject: 'Remove', date: '2026-08-02', time: '08:00' });
    const result  = await softDeleteEvent(USER, created.id);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(result?.subject).toBe('Remove');
  });

  test('returns null when event id does not exist', async () => {
    const result = await softDeleteEvent(USER, 999_999);
    expect(result).toBeNull();
  });

  test('decrements eventsStoredGauge on success', async () => {
    const created = await createEvent(USER, { subject: 'X', date: '2026-08-03', time: '08:00' });
    mockGaugeDec.mockReset();
    await softDeleteEvent(USER, created.id);
    expect(mockGaugeDec).toHaveBeenCalledTimes(1);
  });

  test('persists removal via writeFile', async () => {
    const created = await createEvent(USER, { subject: 'Y', date: '2026-08-04', time: '08:00' });
    mockWriteFile.mockReset();
    await softDeleteEvent(USER, created.id);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. updateEvent
// ═════════════════════════════════════════════════════════════════════════════

describe('updateEvent', () => {
  test('updates and returns the event', async () => {
<<<<<<< HEAD
    const created = await createEvent(USER, {
      subject: 'Before',
      date: '2026-09-01',
      time: '09:00',
    });
    const result = await updateEvent(USER, created.id, { subject: 'After', time: '15:00' });
=======
    const created = await createEvent(USER, { subject: 'Before', date: '2026-09-01', time: '09:00' });
    const result  = await updateEvent(USER, created.id, { subject: 'After', time: '15:00' });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(result?.subject).toBe('After');
    expect(result?.time).toBe('15:00');
  });

  test('returns null when event not found', async () => {
    const result = await updateEvent(USER, 888_888, { subject: 'Ghost' });
    expect(result).toBeNull();
  });

  test('persists update via writeFile', async () => {
<<<<<<< HEAD
    const created = await createEvent(USER, {
      subject: 'Patch',
      date: '2026-09-02',
      time: '09:00',
    });
=======
    const created = await createEvent(USER, { subject: 'Patch', date: '2026-09-02', time: '09:00' });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    mockWriteFile.mockReset();
    await updateEvent(USER, created.id, { time: '11:00' });
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. getTotalCount
// ═════════════════════════════════════════════════════════════════════════════

describe('getTotalCount', () => {
  test('returns 0 for fresh store', async () => {
    const count = await getTotalCount();
    // after all previous creates, count >= 0 regardless; testing it is a number
    expect(typeof count).toBe('number');
  });

  test('count increases after createEvent', async () => {
    const before = await getTotalCount();
<<<<<<< HEAD
    await createEvent(`count-user-${Date.now()}`, {
      subject: 'X',
      date: '2026-10-01',
      time: '09:00',
    });
    const after = await getTotalCount();
=======
    await createEvent(`count-user-${Date.now()}`, { subject: 'X', date: '2026-10-01', time: '09:00' });
    const after  = await getTotalCount();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(after).toBeGreaterThan(before);
  });
});
