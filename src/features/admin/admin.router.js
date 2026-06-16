// src/features/admin/admin.router.js — Admin API surface.
import { Router } from 'express';
import { makeSecurityMiddleware } from '../../services/security.js';
import { getAllFlags, setFlag, FLAGS } from '../../core/featureFlags.js';
import { isTest } from '../../core/config.js';
import { db, dbAvailable } from '../../infra/db/dbClient.js';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  updateUserRole,
  resetUserPassword,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  rotateApiKey,
  fetchSecurityLogs,
  getUsageSummaryHandler,
  getUsageTotalsHandler,
} from './admin.controller.js';

export const adminRouter = Router();
const adminAuth = makeSecurityMiddleware({ resource: 'admin' });

// ── Users ─────────────────────────────────────────────────────────────────────
adminRouter.get('/users', adminAuth, listUsers);
adminRouter.post('/users', adminAuth, createUser);
adminRouter.put('/users/:id', adminAuth, updateUser);
adminRouter.delete('/users/:id', adminAuth, deleteUser);
adminRouter.patch('/users/:id/role', adminAuth, updateUserRole);
adminRouter.post('/users/:id/reset-password', adminAuth, resetUserPassword);

// ── API keys ──────────────────────────────────────────────────────────────────
adminRouter.get('/api-keys', adminAuth, listApiKeys);
adminRouter.post('/api-keys', adminAuth, createApiKey);
adminRouter.delete('/api-keys/:id', adminAuth, revokeApiKey);
adminRouter.post('/api-keys/:id/rotate', adminAuth, rotateApiKey);

// ── Security logs ─────────────────────────────────────────────────────────────
adminRouter.get('/security-logs', adminAuth, fetchSecurityLogs);

// ── Usage / billing ───────────────────────────────────────────────────────────
adminRouter.get('/usage/summary', adminAuth, getUsageSummaryHandler);
adminRouter.get('/usage/totals', adminAuth, getUsageTotalsHandler);

// ── Feature flags ─────────────────────────────────────────────────────────────

adminRouter.get('/flags', adminAuth, async (_req, res, next) => {
  try {
    res.json(await getAllFlags());
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/flags/:name', adminAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" must be a boolean' });
    }
    const knownFlags = Object.values(FLAGS);
    if (!knownFlags.includes(name)) {
      return res.status(400).json({ error: `Unknown flag "${name}"`, validFlags: knownFlags });
    }

    await setFlag(name, enabled);
    res.json({ ok: true, name, enabled });
  } catch (err) {
    next(err);
  }
});

// ── E2E test cleanup (test environment only) ──────────────────────────────────

if (isTest) {
  adminRouter.delete('/e2e/cleanup', adminAuth, async (req, res, next) => {
    if (!dbAvailable) {
      return res.status(503).json({ error: 'DB_UNAVAILABLE' });
    }
    try {
      const { phonePrefix = '+15550000' } = req.body ?? {};
      const deleted = await db('gdpr_requests')
        .where('phone_number', 'like', `${phonePrefix}%`)
        .delete();
      await db('audit_logs')
        .where('phone_number', 'like', `${phonePrefix}%`)
        .delete()
        .catch(() => {});
      res.json({ ok: true, deleted });
    } catch (err) {
      next(err);
    }
  });
}
