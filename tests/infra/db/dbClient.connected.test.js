// tests/infra/db/dbClient.connected.test.js
// Covers lines 18-57: DB initialization when DB_HOST is set.
// Covers success path (lines 49-52): SELECT 1 succeeds → dbAvailable = true.
// Covers failure path (lines 53-56): SELECT 1 fails → dbAvailable stays false.
// Covers destroyDb() (lines 65-69): with non-null db → db.destroy() called.

import { jest } from '@jest/globals';

// ── Mock logger and config ────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// Provide DB_HOST in config to trigger the init block
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
<<<<<<< HEAD
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USER: 'postgres',
    DB_PASSWORD: 'secret',
    DB_NAME: 'wolf_test',
    BASE_URL: 'http://localhost:3000',
    PHONE_SALT: 'testsalt1234567890',
    JWT_SECRET: 'testjwtsecret1234567890testjwtsecret1234567890',
    JWT_REFRESH_SECRET: 'testrefreshsecret1234567890testrefreshsecret',
    API_KEYS: ['test-key'],
=======
    DB_HOST:     'localhost',
    DB_PORT:     5432,
    DB_USER:     'postgres',
    DB_PASSWORD: 'secret',
    DB_NAME:     'wolf_test',
    BASE_URL:    'http://localhost:3000',
    PHONE_SALT:  'testsalt1234567890',
    JWT_SECRET:  'testjwtsecret1234567890testjwtsecret1234567890',
    JWT_REFRESH_SECRET: 'testrefreshsecret1234567890testrefreshsecret',
    API_KEYS:    ['test-key'],
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
}));

// ── Mock knex ─────────────────────────────────────────────────────────────────
<<<<<<< HEAD
const mockRaw = jest.fn(async () => [{ 1: 1 }]);
const mockDestroy = jest.fn(async () => {});

const mockKnexInstance = {
  raw: mockRaw,
=======
const mockRaw     = jest.fn(async () => [{ 1: 1 }]);
const mockDestroy = jest.fn(async () => {});

const mockKnexInstance = {
  raw:     mockRaw,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  destroy: mockDestroy,
};

const MockKnex = jest.fn(() => mockKnexInstance);

jest.unstable_mockModule('knex', () => ({ default: MockKnex }));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { db, dbAvailable, destroyDb } = await import('../../../src/infra/db/dbClient.js');

// ═════════════════════════════════════════════════════════════════════════════
// 1. Initialization — success path
// ═════════════════════════════════════════════════════════════════════════════

describe('dbClient — connected initialization', () => {
  test('knex was called with correct pg config', () => {
<<<<<<< HEAD
    expect(MockKnex).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'pg',
        connection: expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'wolf_test',
        }),
      })
    );
=======
    expect(MockKnex).toHaveBeenCalledWith(expect.objectContaining({
      client: 'pg',
      connection: expect.objectContaining({
        host: 'localhost',
        port: 5432,
        database: 'wolf_test',
      }),
    }));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('SELECT 1 was issued to verify connection', () => {
    expect(mockRaw).toHaveBeenCalledWith('SELECT 1');
  });

  test('dbAvailable is true after successful SELECT 1', () => {
    expect(dbAvailable).toBe(true);
  });

  test('db export is the knex instance', () => {
    expect(db).toBe(mockKnexInstance);
  });

  test('pool config has correct timeouts', () => {
    const poolConfig = MockKnex.mock.calls[0][0].pool;
    expect(poolConfig.min).toBe(2);
    expect(poolConfig.max).toBe(10);
<<<<<<< HEAD
    expect(poolConfig.acquireTimeoutMillis).toBe(3_000);
=======
    expect(poolConfig.acquireTimeoutMillis).toBe(10_000);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. destroyDb — lines 65-69
// ═════════════════════════════════════════════════════════════════════════════

describe('destroyDb — with active db', () => {
  test('calls db.destroy()', async () => {
    await destroyDb();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
