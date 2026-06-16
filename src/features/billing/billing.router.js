// src/features/billing/billing.router.js — Stripe billing endpoints.

import { Router } from 'express';
import { childLogger } from '../../core/logger.js';

const _log = childLogger('billing');
export const billingRouter = Router();

// Placeholder — billing endpoints will be added when Stripe integration is enabled.
billingRouter.get('/status', (_req, res) => {
  res.json({ billing: 'not_configured' });
});
