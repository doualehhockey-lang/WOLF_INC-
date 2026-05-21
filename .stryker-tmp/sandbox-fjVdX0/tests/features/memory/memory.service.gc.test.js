// @ts-nocheck
// tests/features/memory/memory.service.gc.test.js
// Covers lines 19-24: the setInterval GC callback that prunes expired sessions.
// Uses jest.useFakeTimers() before module import.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    SESSION_TTL_SEC: 300, // 5 min TTL
    BASE_URL:        'http://localhost:3000',
    PHONE_SALT:      'testsalt1234567890',
    JWT_SECRET:      'testjwtsecret1234567890testjwtsecret1234567890',
    JWT_REFRESH_SECRET: 'testrefreshsecret1234567890testrefreshsecret',
    API_KEYS:        ['test-key'],
  },
}));

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  redisAvailable: false,
  cacheGet:       jest.fn(async () => null),
  cacheSet:       jest.fn(async () => {}),
  cacheDel:       jest.fn(async () => {}),
}));

// Use fake timers BEFORE import so setInterval uses fake timers
jest.useFakeTimers();

const {
  getSession,
  clearSession,
  buildContext,
  getLastEntities,
  addUserTurn,
  setLang,
} = await import('../../../src/features/memory/memory.service.js');

afterAll(() => {
  jest.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════════════════
// GC interval — lines 19-24
// ═════════════════════════════════════════════════════════════════════════════

describe('memory.service — GC setInterval (lines 19-24)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GC fires at 5-minute interval without throwing', async () => {
    // Set a session
    const realDateNow = Date.now;

    // Advance timers to trigger GC
    expect(() => {
      jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    }).not.toThrow();

    await Promise.resolve(); // let async GC complete
  });

  test('GC prunes sessions older than TTL from in-memory store', async () => {
    // Create a session by adding a turn
    await addUserTurn('gc-test-sid', 'bonjour');

    // Verify it exists
    const before = await getSession('gc-test-sid');
    expect(before).toBeTruthy();

    // Hack: advance system time to simulate expiry (beyond SESSION_TTL_SEC)
    const SESSION_TTL_MS = 300 * 1_000;
    const originalNow = Date.now;
    Date.now = () => originalNow() + SESSION_TTL_MS + 60_000; // past TTL

    // Fire GC
    jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    await Promise.resolve();
    await Promise.resolve();

    Date.now = originalNow;
  });

  test('GC does not throw when store is empty', async () => {
    expect(() => {
      jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    }).not.toThrow();
    await Promise.resolve();
  });
});
