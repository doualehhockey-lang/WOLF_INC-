// tests/infra/db/dbClient.defaults.test.js
// Covers dbClient.js lines 27-30:
//   line 27: config.DB_USER ?? 'postgres'   — right side (DB_USER absent)
//   line 28: config.DB_PASSWORD ?? ''        — right side (DB_PASSWORD absent)
//   line 29: config.DB_NAME ?? 'wolf_engine' — right side (DB_NAME absent)
//   line 30: DB_SSL=true → { rejectUnauthorized: false }

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// Provide DB_HOST but NOT DB_USER, DB_PASSWORD, DB_NAME — exercises ?? defaults
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    // DB_USER intentionally omitted  → ?? 'postgres' right side
    // DB_PASSWORD intentionally omitted → ?? '' right side
    // DB_NAME intentionally omitted  → ?? 'wolf_engine' right side
  },
}));

let capturedConfig = null;

const mockRaw = jest.fn(async () => [{ 1: 1 }]);
jest.unstable_mockModule('knex', () => ({
<<<<<<< HEAD
  default: jest.fn(cfg => {
=======
  default: jest.fn((cfg) => {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    capturedConfig = cfg;
    return { raw: mockRaw, destroy: jest.fn() };
  }),
}));

// Set DB_SSL=true before import to exercise the ssl: { rejectUnauthorized: false } branch
process.env.DB_SSL = 'true';

await import('../../../src/infra/db/dbClient.js');

afterAll(() => {
  delete process.env.DB_SSL;
});

// ═════════════════════════════════════════════════════════════════════════════
// ?? defaults — lines 27-29
// ═════════════════════════════════════════════════════════════════════════════

describe('dbClient — config ?? defaults (lines 27-29)', () => {
  test('uses "postgres" as default DB_USER when not configured', () => {
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig.connection.user).toBe('postgres');
  });

  test('uses empty string as default DB_PASSWORD when not configured', () => {
    expect(capturedConfig.connection.password).toBe('');
  });

  test('uses "wolf_engine" as default DB_NAME when not configured', () => {
    expect(capturedConfig.connection.database).toBe('wolf_engine');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SSL enabled — line 30
// ═════════════════════════════════════════════════════════════════════════════

describe('dbClient — SSL enabled (line 30)', () => {
  test('passes { rejectUnauthorized: false } when DB_SSL=true', () => {
    expect(capturedConfig.connection.ssl).toEqual({ rejectUnauthorized: false });
  });
});
