// @ts-nocheck
// tests/api/dateparser.test.js

import { resolve } from '../../src/services/dateparser.js';

describe('dateparser.resolve', () => {
  const REF = new Date('2026-05-19T10:00:00Z'); // Tuesday

  test('resolves "aujourd\'hui"', () => {
    const r = resolve("aujourd'hui", '', REF);
    expect(r.date).toBe('2026-05-19');
    expect(r.hasDate).toBe(true);
  });

  test('resolves "demain"', () => {
    const r = resolve('demain', '', REF);
    expect(r.date).toBe('2026-05-20');
  });

  test('resolves day name "lundi" (next Monday from Tuesday)', () => {
    const r = resolve('lundi', '', REF);
    expect(r.date).toBe('2026-05-25');
  });

  test('resolves day name "mercredi" (next Wednesday from Tuesday)', () => {
    const r = resolve('mercredi', '', REF);
    expect(r.date).toBe('2026-05-20');
  });

  test('resolves DD/MM date', () => {
    const r = resolve('15/06', '', REF);
    expect(r.date).toBe('2026-06-15');
  });

  test('resolves ISO date string', () => {
    const r = resolve('2026-07-04', '', REF);
    expect(r.date).toBe('2026-07-04');
  });

  test('resolves "14h30" time', () => {
    const r = resolve('', '14h30', REF);
    expect(r.time).toBe('14:30');
    expect(r.hasTime).toBe(true);
  });

  test('resolves "9h" time (no minutes)', () => {
    const r = resolve('', '9h', REF);
    expect(r.time).toBe('09:00');
  });

  test('resolves "09:00" colon format', () => {
    const r = resolve('', '09:00', REF);
    expect(r.time).toBe('09:00');
  });

  test('builds ISO when both date and time present', () => {
    const r = resolve('demain', '14h30', REF);
    expect(r.iso).toBe('2026-05-20T14:30:00');
  });

  test('iso is null when only date', () => {
    const r = resolve('demain', '', REF);
    expect(r.iso).toBeNull();
    expect(r.hasTime).toBe(false);
  });

  test('returns no-op for empty inputs', () => {
    const r = resolve('', '', REF);
    expect(r.hasDate).toBe(false);
    expect(r.hasTime).toBe(false);
    expect(r.iso).toBeNull();
  });

  test('caps hours > 23', () => {
    const r = resolve('', '25h00', REF);
    expect(r.time).toBe('23:00');
  });
});
