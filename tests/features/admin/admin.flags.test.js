// tests/features/admin/admin.flags.test.js
// Covers: GET /admin/flags and PATCH /admin/flags/:name routes

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// ── featureFlags mock ─────────────────────────────────────────────────────────
const mockGetAllFlags = jest.fn(async () => ({
  'claude.nlu': { enabled: true, default: true, cached: true, key: 'ff:wolf:claude.nlu' },
  'pipeline.voice': { enabled: false, default: true, cached: false, key: 'ff:wolf:pipeline.voice' },
}));
const mockSetFlag = jest.fn(async () => {});

jest.unstable_mockModule('../../../src/core/featureFlags.js', () => ({
  getAllFlags: mockGetAllFlags,
  setFlag: mockSetFlag,
  isEnabled: jest.fn(async () => true),
  snapshotFlags: jest.fn(() => ({})),
  clearCache: jest.fn(),
  FLAGS: {
    CLAUDE_NLU: 'claude.nlu',
    TTS_ELEVENLABS: 'tts.elevenlabs',
    TTS_AZURE: 'tts.azure',
    TTS_PIPER: 'tts.piper',
    PIPELINE_VOICE: 'pipeline.voice',
    PIPELINE_SMS: 'pipeline.sms',
    MEMORY_CONTEXT: 'memory.context',
    RATE_LIMIT: 'rate-limit',
    AUDIT_LOG: 'audit.log',
    TRANSLATION: 'translation',
  },
}));

jest.unstable_mockModule('../../../src/services/security.js', () => ({
  makeSecurityMiddleware: jest.fn(() => (_req, _res, next) => next()),
}));

jest.unstable_mockModule('../../../src/features/admin/admin.controller.js', () => ({
  listUsers: jest.fn((_req, res) => res.json([])),
  createUser: jest.fn((_req, res) => res.json({})),
  updateUser: jest.fn((_req, res) => res.json({})),
  deleteUser: jest.fn((_req, res) => res.json({})),
  updateUserRole: jest.fn((_req, res) => res.json({})),
  resetUserPassword: jest.fn((_req, res) => res.json({})),
  listApiKeys: jest.fn((_req, res) => res.json([])),
  createApiKey: jest.fn((_req, res) => res.json({})),
  revokeApiKey: jest.fn((_req, res) => res.json({})),
  rotateApiKey: jest.fn((_req, res) => res.json({})),
  fetchSecurityLogs: jest.fn((_req, res) => res.json([])),
  getUsageSummaryHandler: jest.fn((_req, res) => res.json({ data: [] })),
  getUsageTotalsHandler: jest.fn((_req, res) => res.json({ data: {} })),
}));

const { adminRouter } = await import('../../../src/features/admin/admin.router.js');

// Wire router into a minimal Express app
const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

// ── GET /admin/flags ──────────────────────────────────────────────────────────

describe('GET /admin/flags', () => {
  test('returns 200 with all flag entries', async () => {
    const res = await request(app).get('/admin/flags');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty(['claude.nlu']);
    expect(res.body['claude.nlu']).toMatchObject({ enabled: true, default: true });
  });

  test('calls getAllFlags()', async () => {
    await request(app).get('/admin/flags');
    expect(mockGetAllFlags).toHaveBeenCalled();
  });
});

// ── PATCH /admin/flags/:name ──────────────────────────────────────────────────

describe('PATCH /admin/flags/:name', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 200 and calls setFlag with name and enabled=false', async () => {
    const res = await request(app).patch('/admin/flags/pipeline.voice').send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, name: 'pipeline.voice', enabled: false });
    expect(mockSetFlag).toHaveBeenCalledWith('pipeline.voice', false);
  });

  test('returns 200 and calls setFlag with enabled=true', async () => {
    const res = await request(app).patch('/admin/flags/claude.nlu').send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, name: 'claude.nlu', enabled: true });
    expect(mockSetFlag).toHaveBeenCalledWith('claude.nlu', true);
  });

  test('returns 400 when enabled is not a boolean', async () => {
    const res = await request(app).patch('/admin/flags/claude.nlu').send({ enabled: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/boolean/);
    expect(mockSetFlag).not.toHaveBeenCalled();
  });

  test('returns 400 for unknown flag name', async () => {
    const res = await request(app).patch('/admin/flags/unknown.flag.xyz').send({ enabled: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown flag/);
    expect(res.body.validFlags).toBeInstanceOf(Array);
    expect(mockSetFlag).not.toHaveBeenCalled();
  });

  test('returns 400 when enabled field is missing', async () => {
    const res = await request(app).patch('/admin/flags/claude.nlu').send({});

    expect(res.status).toBe(400);
    expect(mockSetFlag).not.toHaveBeenCalled();
  });
});
