// tests/infra/db/dbClient.afterCreate.test.js
// Covers dbClient.js line 39: the afterCreate pool callback.
// We capture the knex config and invoke afterCreate directly.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
<<<<<<< HEAD
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USER: 'postgres',
    DB_PASSWORD: 'secret',
    DB_NAME: 'wolf_test',
=======
    DB_HOST:     'localhost',
    DB_PORT:     5432,
    DB_USER:     'postgres',
    DB_PASSWORD: 'secret',
    DB_NAME:     'wolf_test',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
}));

// Capture the knex config so we can test afterCreate
let capturedConfig = null;

<<<<<<< HEAD
const mockRaw = jest.fn(async () => []);
const mockDestroy = jest.fn(async () => {});

jest.unstable_mockModule('knex', () => ({
  default: jest.fn(cfg => {
=======
const mockRaw     = jest.fn(async () => []);
const mockDestroy = jest.fn(async () => {});

jest.unstable_mockModule('knex', () => ({
  default: jest.fn((cfg) => {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    capturedConfig = cfg;
    return { raw: mockRaw, destroy: mockDestroy };
  }),
}));

await import('../../../src/infra/db/dbClient.js');

// ═════════════════════════════════════════════════════════════════════════════
// afterCreate pool callback — line 39
// ═════════════════════════════════════════════════════════════════════════════

describe('dbClient — afterCreate pool callback (line 39)', () => {
  test('afterCreate is defined in the knex config', () => {
    expect(capturedConfig?.pool?.afterCreate).toBeInstanceOf(Function);
  });

  test('afterCreate calls conn.query("SELECT 1") then done(null, conn) on success', done => {
    const mockConn = {
      query: jest.fn((sql, cb) => cb(null)), // no error
    };
    capturedConfig.pool.afterCreate(mockConn, (err, conn) => {
      expect(mockConn.query).toHaveBeenCalledWith('SELECT 1', expect.any(Function));
      expect(err).toBeNull();
      expect(conn).toBe(mockConn);
      done();
    });
  });

  test('afterCreate calls done(err, conn) when query fails', done => {
    const queryErr = new Error('connection rejected');
    const mockConn = {
      query: jest.fn((sql, cb) => cb(queryErr)),
    };
    capturedConfig.pool.afterCreate(mockConn, (err, conn) => {
      expect(err).toBe(queryErr);
      expect(conn).toBe(mockConn);
      done();
    });
  });
});
