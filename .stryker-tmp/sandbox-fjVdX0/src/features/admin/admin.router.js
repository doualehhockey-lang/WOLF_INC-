// @ts-nocheck
// src/features/admin/admin.router.js — Admin API surface.
import { Router } from 'express';
import { makeSecurityMiddleware } from '../../services/security.js';
import { getAllFlags, setFlag, FLAGS } from '../../core/featureFlags.js';
import {
  listUsers, createUser, updateUser, deleteUser,
  listApiKeys, createApiKey, revokeApiKey,
  fetchSecurityLogs,
  triggerCanary, promoteCanary, rollbackDeploy,
  fetchK8sPods, fetchK8sHpa,
  fetchGrafanaPanels,
} from './admin.controller.js';

export const adminRouter = Router();
const adminAuth = makeSecurityMiddleware({ resource: 'admin' });

// Users
adminRouter.get('/users', adminAuth, listUsers);
adminRouter.post('/users', adminAuth, createUser);
adminRouter.put('/users/:id', adminAuth, updateUser);
adminRouter.delete('/users/:id', adminAuth, deleteUser);

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
adminRouter.get('/flags', adminAuth, async (_req, res, next) => {
  try {
    res.json(await getAllFlags());
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin/flags/:name
 * Enable or disable a feature flag by its Redis key name (e.g. "claude.nlu").
 * Body: { "enabled": true|false }
 * Use FLAGS.* constants for valid names.
 */
adminRouter.patch('/flags/:name', adminAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" must be a boolean' });
    }

    // Validate that the flag name is a known flag value
    const knownFlags = Object.values(FLAGS);
    if (!knownFlags.includes(name)) {
      return res.status(400).json({
        error: `Unknown flag "${name}"`,
        validFlags: knownFlags,
      });
    }

    await setFlag(name, enabled);
    res.json({ ok: true, name, enabled });
  } catch (err) {
    next(err);
  }
});
