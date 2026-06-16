// @ts-nocheck
// tests/services/dateparser.defaults.test.js
// Covers dateparser.js line 23: resolve(rawDate, rawTime) without referenceDate
// → triggers the default parameter `referenceDate = new Date()`

import { resolve } from '../../src/services/dateparser.js';

// ═════════════════════════════════════════════════════════════════════════════
// Line 23: resolve — default referenceDate parameter
// ═════════════════════════════════════════════════════════════════════════════

describe('resolve — default referenceDate (line 23)', () => {
  test('resolves "aujourd\'hui" to today when no referenceDate passed', () => {
    // Call WITHOUT referenceDate → triggers `referenceDate = new Date()` default
    const r = resolve("aujourd'hui", '');
    const today = new Date().toISOString().slice(0, 10);
    expect(r.date).toBe(today);
    expect(r.hasDate).toBe(true);
  });

  test('resolves "demain" to tomorrow when no referenceDate passed', () => {
    const r = resolve('demain', null);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(r.date).toBe(tomorrow.toISOString().slice(0, 10));
  });

  test('resolves weekday "lundi" relative to today when no referenceDate passed', () => {
    const r = resolve('lundi', '14h00');
    // Should return a valid date string (next Monday)
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.time).toBe('14:00');
    expect(r.hasDate).toBe(true);
    expect(r.hasTime).toBe(true);
  });

  test('returns null date when rawDate is empty and no referenceDate passed', () => {
    const r = resolve('', '');
    expect(r.date).toBeNull();
    expect(r.hasDate).toBe(false);
  });
});
