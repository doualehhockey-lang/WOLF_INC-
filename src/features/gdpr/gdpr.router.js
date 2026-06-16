// src/features/gdpr/gdpr.router.js — GDPR data access and deletion requests.

import { Router } from 'express';
import { requireJwt } from '../../features/auth/auth.middleware.js';
import { childLogger } from '../../core/logger.js';
import { db, dbAvailable } from '../../infra/db/dbClient.js';

const log = childLogger('gdpr');
export const gdprRouter = Router();

// GET /api/user/data — Export user data (GDPR right of access)
gdprRouter.get('/data', requireJwt, async (req, res, next) => {
  if (!dbAvailable) return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  try {
    const events = await db('events').where({ user_key: req.user.sub }).select('*');
    res.json({ email: req.user.sub, events });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/user/data — Request data deletion (GDPR right to erasure)
gdprRouter.delete('/data', requireJwt, async (req, res, next) => {
  if (!dbAvailable) return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  try {
    await db('events').where({ user_key: req.user.sub }).update({ deleted_at: db.fn.now() });
    log.info({ sub: req.user.sub }, 'GDPR deletion request processed');
    res.json({ ok: true, message: 'Données supprimées' });
  } catch (err) {
    next(err);
  }
});
