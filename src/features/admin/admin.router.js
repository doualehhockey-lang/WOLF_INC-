// src/features/admin/admin.router.js — Admin API surface.
import { Router } from 'express';
import { makeSecurityMiddleware } from '../../services/security.js';
import { getAllFlags, setFlag, FLAGS } from '../../core/featureFlags.js';
<<<<<<< HEAD
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
=======
import {
  listUsers, createUser, updateUser, deleteUser,
  listApiKeys, createApiKey, revokeApiKey,
  fetchSecurityLogs,
  triggerCanary, promoteCanary, rollbackDeploy,
  fetchK8sPods, fetchK8sHpa,
  fetchGrafanaPanels,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
} from './admin.controller.js';

export const adminRouter = Router();
const adminAuth = makeSecurityMiddleware({ resource: 'admin' });

<<<<<<< HEAD
// ── Users ─────────────────────────────────────────────────────────────────────
=======
// Users
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
adminRouter.get('/users', adminAuth, listUsers);
adminRouter.post('/users', adminAuth, createUser);
adminRouter.put('/users/:id', adminAuth, updateUser);
adminRouter.delete('/users/:id', adminAuth, deleteUser);
<<<<<<< HEAD
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

=======

// API keys
adminRouter.get('/api-keys', adminAuth, listApiKeys);
adminRouter.post('/api-keys', adminAuth, createApiKey);
adminRouter.delete('/api-keys/:id', adminAuth, revokeApiKey);

// Security logs
adminRouter.get('/security-logs', adminAuth, fetchSecurityLogs);

// Deploy controls
adminRouter.post('/deploy/canary', adminAuth, triggerCanary);
adminRouter.post('/deploy/promote', adminAuth, promoteCanary);
adminRouter.post('/deploy/rollback', adminAuth, rollbackDeploy);

// K8s
adminRouter.get('/k8s/pods', adminAuth, fetchK8sPods);
adminRouter.get('/k8s/hpa', adminAuth, fetchK8sHpa);

// Observability
adminRouter.get('/observability/grafana/panels', adminAuth, fetchGrafanaPanels);

// ── Feature flags ─────────────────────────────────────────────────────────────

/**
 * GET /admin/flags
 * Returns the current state of all feature flags (enabled, default, cached, key).
 */
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
adminRouter.get('/flags', adminAuth, async (_req, res, next) => {
  try {
    res.json(await getAllFlags());
  } catch (err) {
    next(err);
  }
});

<<<<<<< HEAD
=======
/**
 * PATCH /admin/flags/:name
 * Enable or disable a feature flag by its Redis key name (e.g. "claude.nlu").
 * Body: { "enabled": true|false }
 * Use FLAGS.* constants for valid names.
 */
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
adminRouter.patch('/flags/:name', adminAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" must be a boolean' });
    }
<<<<<<< HEAD
    const knownFlags = Object.values(FLAGS);
    if (!knownFlags.includes(name)) {
      return res.status(400).json({ error: `Unknown flag "${name}"`, validFlags: knownFlags });
=======

    // Validate that the flag name is a known flag value
    const knownFlags = Object.values(FLAGS);
    if (!knownFlags.includes(name)) {
      return res.status(400).json({
        error: `Unknown flag "${name}"`,
        validFlags: knownFlags,
      });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    }

    await setFlag(name, enabled);
    res.json({ ok: true, name, enabled });
  } catch (err) {
    next(err);
  }
});
<<<<<<< HEAD

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
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
