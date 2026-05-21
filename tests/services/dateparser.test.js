// tests/services/dateparser.test.js
// Full branch coverage for src/services/dateparser.js
// Covers: aujourd'hui, demain, weekday, dd/mm, ISO date, time patterns, empty inputs.

import { resolve } from '../../src/services/dateparser.js';

// Fixed reference date: Wednesday 2026-06-03 (getDay() = 3)
const REF = new Date('2026-06-03T12:00:00Z');

// ═════════════════════════════════════════════════════════════════════════════
// Date resolution
// ═════════════════════════════════════════════════════════════════════════════

describe('resolve — date: empty / null / undefined', () => {
  test('returns null date when rawDate is empty string', () => {
    const r = resolve('', '', REF);
    expect(r.date).toBeNull();
    expect(r.hasDate).toBe(false);
  });

  test('returns null date when rawDate is null', () => {
    const r = resolve(null, null, REF);
    expect(r.date).toBeNull();
    expect(r.hasDate).toBe(false);
  });

  test('returns null date when rawDate is undefined', () => {
    const r = resolve(undefined, undefined, REF);
    expect(r.date).toBeNull();
    expect(r.hasDate).toBe(false);
  });
});

describe("resolve — date: aujourd'hui", () => {
  test("recognises \"aujourd'hui\"", () => {
    const r = resolve("aujourd'hui", '', REF);
    expect(r.date).toBe('2026-06-03');
    expect(r.hasDate).toBe(true);
  });

  test('recognises "aujourd hui" (without apostrophe)', () => {
    const r = resolve('aujourd hui', '', REF);
    expect(r.date).toBe('2026-06-03');
  });
});

describe('resolve — date: demain', () => {
  test('returns tomorrow relative to referenceDate', () => {
    const r = resolve('demain', '', REF);
    expect(r.date).toBe('2026-06-04');
  });
});

describe('resolve — date: weekdays (_nextWeekday)', () => {
  // REF is Wednesday 2026-06-03 (day=3)
  // next lundi  = 2026-06-08 (+5 days)
  // next mardi  = 2026-06-09 (+6 days)
  // next jeudi  = 2026-06-04 (+1 day — next occurrence)
  // next samedi = 2026-06-06 (+3 days)
  // next dimanche = 2026-06-07 (+4 days)

  test('next lundi from Wednesday', () => {
    const r = resolve('lundi', '', REF);
    expect(r.date).toBe('2026-06-08');
  });

  test('next mardi from Wednesday', () => {
    const r = resolve('mardi', '', REF);
    expect(r.date).toBe('2026-06-09');
  });

  test('next mercredi from Wednesday → next week (never same day)', () => {
    const r = resolve('mercredi', '', REF);
    expect(r.date).toBe('2026-06-10');
  });

  test('next jeudi from Wednesday', () => {
    const r = resolve('jeudi', '', REF);
    expect(r.date).toBe('2026-06-04');
  });

  test('next vendredi from Wednesday', () => {
    const r = resolve('vendredi', '', REF);
    expect(r.date).toBe('2026-06-05');
  });

  test('next samedi from Wednesday', () => {
    const r = resolve('samedi', '', REF);
    expect(r.date).toBe('2026-06-06');
  });

  test('next dimanche from Wednesday', () => {
    const r = resolve('dimanche', '', REF);
    expect(r.date).toBe('2026-06-07');
  });

  test('unknown weekday-like string falls through to ISO parse', () => {
    // "vendredi2" doesn't match WEEKDAYS, falls to new Date()
    const r = resolve('not-a-day', '', REF);
    expect(r.date).toBeNull(); // invalid date
  });
});

describe('resolve — date: dd/mm format', () => {
  test('resolves 15/06', () => {
    const r = resolve('15/06', '', REF);
    expect(r.date).toBe('2026-06-15');
  });

  test('resolves 1/1 (single digit day and month)', () => {
    const r = resolve('1/1', '', REF);
    expect(r.date).toBe('2026-01-01');
  });
});

describe('resolve — date: ISO / generic date string', () => {
  test('resolves ISO string 2026-09-01', () => {
    const r = resolve('2026-09-01', '', REF);
    expect(r.date).toBe('2026-09-01');
  });

  test('invalid generic string → null', () => {
    const r = resolve('not-a-date', '', REF);
    expect(r.date).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Time resolution
// ═════════════════════════════════════════════════════════════════════════════

describe('resolve — time parsing', () => {
  test('14h30 → "14:30"', () => {
    const r = resolve('', '14h30', REF);
    expect(r.time).toBe('14:30');
    expect(r.hasTime).toBe(true);
  });

  test('9h → "09:00"', () => {
    const r = resolve('', '9h', REF);
    expect(r.time).toBe('09:00');
  });

  test('09:00 (colon format) → "09:00"', () => {
    const r = resolve('', '09:00', REF);
    expect(r.time).toBe('09:00');
  });

  test('8h05 → "08:05"', () => {
    const r = resolve('', '8h05', REF);
    expect(r.time).toBe('08:05');
  });

  test('25h clamped to 23:00', () => {
    const r = resolve('', '25h', REF);
    expect(r.time).toBe('23:00');
  });

  test('12h75 — minute clamped to 59', () => {
    const r = resolve('', '12h75', REF);
    expect(r.time).toBe('12:59');
  });

  test('invalid time string → null', () => {
    const r = resolve('', 'midi', REF);
    expect(r.time).toBeNull();
    expect(r.hasTime).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ISO composite
// ═════════════════════════════════════════════════════════════════════════════

describe('resolve — iso composite', () => {
  test('date + time → non-null iso', () => {
    const r = resolve('demain', '10h00', REF);
    expect(r.iso).toBe('2026-06-04T10:00:00');
  });

  test('date only → iso is null', () => {
    const r = resolve('demain', '', REF);
    expect(r.iso).toBeNull();
  });

  test('time only → iso is null', () => {
    const r = resolve('', '10h00', REF);
    expect(r.iso).toBeNull();
  });

  test('neither date nor time → all null', () => {
    const r = resolve('', '', REF);
    expect(r.date).toBeNull();
    expect(r.time).toBeNull();
    expect(r.iso).toBeNull();
  });
});
