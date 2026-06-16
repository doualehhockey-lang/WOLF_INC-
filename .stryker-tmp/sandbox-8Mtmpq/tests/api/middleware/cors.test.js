// @ts-nocheck
// tests/api/middleware/cors.test.js
// Covers cors.js line 13: the CORS rejection branch (origin not in whitelist).

import { jest }   from '@jest/globals';
import express    from 'express';
import request    from 'supertest';

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config:      {},
  corsOrigins: ['https://allowed.example.com', 'https://other.example.com'],
  isProd:      false,
  isTest:      true,
  apiKeys:     ['test-key'],
}));

const { cors } = await import('../../../src/api/middleware/cors.js');

// Build a minimal Express app with the cors middleware
function makeApp() {
  const app = express();
  app.use(cors);
  // Add a simple error handler to convert cors errors to a response
  app.get('/test', (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => {
    res.status(403).json({ error: err.message });
  });
  return app;
}

describe('CORS middleware — origin whitelist (cors.js)', () => {
  let app;
  beforeAll(() => { app = makeApp(); });

  test('allows requests with no origin (server-to-server)', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  test('allows whitelisted origin', async () => {
    const res = await request(app)
      .get('/test')
      .set('Origin', 'https://allowed.example.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example.com');
  });

  test('rejects disallowed origin with 403 — covers cors.js line 13', async () => {
    const res = await request(app)
      .get('/test')
      .set('Origin', 'https://evil.hacker.com');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CORS.*not allowed/i);
  });

  test('rejects another disallowed origin', async () => {
    const res = await request(app)
      .get('/test')
      .set('Origin', 'http://localhost:9999');
    expect(res.status).toBe(403);
  });
});
