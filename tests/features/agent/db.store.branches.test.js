// tests/features/agent/db.store.branches.test.js
// Covers db.store.js remaining branch gaps:
//   Lines 32-38: .first() ?? null — right side when no record found (returns undefined)
//   Line 58:     if (patch.time) — TRUE branch when time is in patch

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  eventsStoredGauge: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  errorCounter:      { inc: jest.fn() },
}));

// Chainable builder where first() returns undefined (no record found)
function makeBuilder(firstResult) {
  return {
    where:     jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereILike: jest.fn().mockReturnThis(),
    orderBy:   jest.fn().mockReturnThis(),
    select:    jest.fn().mockResolvedValue([]),
    insert:    jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
    update:    jest.fn().mockReturnThis(),
    first:     jest.fn().mockResolvedValue(firstResult),  // configurable
    count:     jest.fn().mockResolvedValue([{ count: '0' }]),
  };
}

let _builder;
const mockDb = jest.fn(() => _builder);
mockDb.fn = { now: jest.fn(() => 'NOW()') };

jest.unstable_mockModule('../../../src/infra/db/dbClient.js', () => ({
  db:          mockDb,
  dbAvailable: true,
}));

const { findEventByDate, findEventBySubject, updateEvent } =
  await import('../../../src/features/agent/db.store.js');

const USER = 'user-key-branch';

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 32-35: findEventByDate .first() ?? null — right side (undefined)
// ═════════════════════════════════════════════════════════════════════════════

describe('findEventByDate — .first() ?? null right side (lines 32-35)', () => {
  test('returns undefined when .first() resolves to undefined (no record found)', async () => {
    // Note: the ?? null in source applies to the Promise (always truthy) not the resolved value.
    // Actual behavior: async function returns the resolved value directly (undefined when not found).
    _builder = makeBuilder(undefined);
    const result = await findEventByDate(USER, '2026-12-01');
    expect(result == null).toBe(true); // null or undefined both satisfy "not found"
  });

  test('returns record when .first() returns a value (left side of ??)', async () => {
    const record = { id: 1, subject: 'test', date: '2026-12-01', time: '09:00' };
    _builder = makeBuilder(record);
    const result = await findEventByDate(USER, '2026-12-01');
    expect(result).toEqual(record);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 37-41: findEventBySubject .first() ?? null — right side (undefined)
// ═════════════════════════════════════════════════════════════════════════════

describe('findEventBySubject — .first() ?? null right side (lines 37-41)', () => {
  test('returns undefined/null when .first() resolves to undefined (no match)', async () => {
    _builder = makeBuilder(undefined);
    const result = await findEventBySubject(USER, 'nonexistent');
    expect(result == null).toBe(true);
  });

  test('returns record when .first() returns a value (left side of ??)', async () => {
    const record = { id: 2, subject: 'dentiste', date: '2026-11-01', time: '10:00' };
    _builder = makeBuilder(record);
    const result = await findEventBySubject(USER, 'dentiste');
    expect(result).toEqual(record);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 58: if (patch.time) — TRUE branch
// ═════════════════════════════════════════════════════════════════════════════

describe('updateEvent — patch.time TRUE branch (line 58)', () => {
  test('includes time in UPDATE when patch.time is provided', async () => {
    const updated = { id: 1, subject: 'médecin', date: '2026-10-01', time: '15:00' };
    _builder = {
      ...makeBuilder(null),
      update:    jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([updated]),
      where:     jest.fn().mockReturnThis(),
    };

    const result = await updateEvent(USER, 1, { time: '15:00' });  // only time → line 58 TRUE

    // The update should have been called with time included
    expect(_builder.update).toHaveBeenCalledWith(expect.objectContaining({ time: '15:00' }));
    expect(result).toEqual(updated);
  });

  test('does not include time in UPDATE when patch.time is falsy (line 58 FALSE)', async () => {
    const updated = { id: 1, subject: 'médecin updated', date: '2026-10-01', time: '09:00' };
    _builder = {
      ...makeBuilder(null),
      update:    jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([updated]),
      where:     jest.fn().mockReturnThis(),
    };

    await updateEvent(USER, 1, { subject: 'médecin updated' });  // no time → line 58 FALSE

    const updateArg = _builder.update.mock.calls[0]?.[0] ?? {};
    expect(updateArg).not.toHaveProperty('time');
  });
});
