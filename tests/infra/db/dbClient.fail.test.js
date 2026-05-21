// tests/infra/db/dbClient.fail.test.js
// Covers lines 53-56: SELECT 1 fails → logs error, dbAvailable stays false.
// Also covers destroyDb() when db is non-null but connection failed (db still set).

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    DB_HOST:     'bad-host',
    DB_PORT:     5432,
    DB_USER:     'postgres',
    DB_PASSWORD: '',
    DB_NAME:     'wolf_engine',
    BASE_URL:    'http://localhost:3000',
    PHONE_SALT:  'testsalt1234567890',
    JWT_SECRET:  'testjwtsecret1234567890testjwtsecret1234567890',
    JWT_REFRESH_SECRET: 'testrefreshsecret1234567890testrefreshsecret',
    API_KEYS:    ['test-key'],
  },
}));

// ── knex mock: raw() rejects ──────────────────────────────────────────────────
const mockDestroy = jest.fn(async () => {});
const mockKnexInstance = {
  raw:     jest.fn(async () => { throw new Error('ECONNREFUSED bad-host:5432'); }),
  destroy: mockDestroy,
};

jest.unstable_mockModule('knex', () => ({
  default: jest.fn(() => mockKnexInstance),
}));

const { db, dbAvailable, destroyDb } = await import('../../../src/infra/db/dbClient.js');

// ═════════════════════════════════════════════════════════════════════════════

describe('dbClient — SELECT 1 failure (lines 53-56)', () => {
  test('dbAvailable is false when SELECT 1 throws', () => {
    expect(dbAvailable).toBe(false);
  });

  test('db is NOT nulled out — callers get clear errors on query', () => {
    // Source comment: "Do NOT null-out db here" — db is still the knex instance
    expect(db).toBe(mockKnexInstance);
  });
});

describe('destroyDb — after failed connection', () => {
  test('still calls db.destroy() (db is non-null)', async () => {
    await destroyDb();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
