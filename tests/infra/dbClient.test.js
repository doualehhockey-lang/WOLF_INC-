// tests/infra/dbClient.test.js
// Unit tests for dbClient.js — verifies fallback mode when DB_HOST is not set.
// Does NOT require a running PostgreSQL instance.

process.env.BASE_URL = 'http://localhost:3000';
process.env.PHONE_SALT = 'testsalt1234567890';
process.env.JWT_SECRET = 'testjwtsecret1234567890testjwtsecret1234567890';
process.env.JWT_REFRESH_SECRET = 'testrefreshsecret1234567890testrefreshsecret';
process.env.API_KEYS = 'test-key';
// Explicitly unset DB_HOST — .env may set it; we need fallback mode for this test.
delete process.env.DB_HOST;

import { db, dbAvailable, destroyDb } from '../../src/infra/db/dbClient.js';

describe('dbClient — fallback mode (no DB_HOST or connection fails)', () => {
  test('dbAvailable is false when DB is not reachable', () => {
    // dbAvailable reflects whether the connection succeeded.
    // In test env, DB_HOST may be set via .env but PostgreSQL is not running,
    // so dbAvailable should be false regardless.
    expect(dbAvailable).toBe(false);
  });

  test('destroyDb resolves without throwing', async () => {
    await expect(destroyDb()).resolves.toBeUndefined();
  });
});
