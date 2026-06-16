// tests/api/server.https.test.js
// Covers src/api/server.js lines 63-69: the HTTPS redirect middleware
// activated when isProd = true.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// isProd = true → the redirect block executes
jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    AUDIO_DIR: '/tmp/audio',
    BASE_URL: 'https://wolf.example.com',
    PHONE_SALT: 'testsalt1234567890',
    JWT_SECRET: 'testjwtsecret1234567890testjwtsecret1234567890',
    JWT_REFRESH_SECRET: 'testrefreshsecret1234567890testrefreshsecret',
    API_KEYS: ['test-key'],
    CORS_ORIGINS: 'https://wolf.example.com',
  },
  isProd: true,
  isTest: false,
  apiKeys: ['test-key'],
  corsOrigins: ['https://wolf.example.com'],
}));

jest.unstable_mockModule('../../src/core/metrics.js', () => ({
  nluLatency: { startTimer: jest.fn(() => jest.fn()) },
  eventsStoredGauge: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  errorCounter: { inc: jest.fn() },
  httpRequestsTotal: { inc: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
}));

jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  redisAvailable: false,
  cacheGet: jest.fn(async () => null),
  cacheSet: jest.fn(async () => {}),
  cacheDel: jest.fn(async () => {}),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  evalScript: jest.fn(async () => null),
}));

jest.unstable_mockModule('../../src/infra/db/dbClient.js', () => ({
  dbAvailable: false,
  db: null,
  destroyDb: jest.fn(),
  pendingMigrationCount: 0,
}));

// Routers must be real Express routers (functions)
const stubRouter = express.Router();
const stubAdminRouter = express.Router();
stubRouter.get('/probe', (_req, res) => res.json({ ok: true }));

jest.unstable_mockModule('../../src/api/router.js', () => ({
  router: stubRouter,
}));

jest.unstable_mockModule('../../src/features/admin/admin.router.js', () => ({
  adminRouter: stubAdminRouter,
}));

const { createApp } = await import('../../src/api/server.js');

// ═════════════════════════════════════════════════════════════════════════════
// HTTPS redirect — lines 63-69
// ═════════════════════════════════════════════════════════════════════════════

describe('createApp — HTTPS redirect in production (lines 63-69)', () => {
  let app;
  beforeAll(() => {
    app = createApp();
  });

  test('redirects (301) when x-forwarded-proto != https', async () => {
    const res = await request(app)
      .get('/probe')
      .set('Origin', 'https://wolf.example.com')
      .set('X-Forwarded-Proto', 'http')
      .set('Host', 'wolf.example.com');

    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://wolf.example.com/probe');
  });

  test('does NOT redirect when x-forwarded-proto is already https', async () => {
    const res = await request(app)
      .get('/probe')
      .set('Origin', 'https://wolf.example.com')
      .set('X-Forwarded-Proto', 'https')
      .set('Host', 'wolf.example.com');

    // Should reach the route handler (200) rather than being redirected
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
