// src/api/router.js — Root Express router.
// Mounts all feature routers and REST endpoints.
// Order matters: Twilio HMAC is applied only on /twilio routes.

import { Router }          from 'express';
import { register }        from '../core/metrics.js';
import { twilioHmac }      from './middleware/twilioHmac.js';
import { validateBody, ReplyBodySchema } from './middleware/validation.js';
import { requireJwt }      from '../features/auth/auth.middleware.js';
import { authRouter }      from '../features/auth/auth.router.js';
import { voiceRouter }     from '../features/voice/voice.router.js';
import { smsRouter }       from '../features/sms/sms.router.js';
import { autoReply, getTones } from '../features/responder/responder.service.js';
import { childLogger }     from '../core/logger.js';
import { config }          from '../core/config.js';
import { adminRouter }     from '../features/admin/admin.router.js';
import { makeSecurityMiddleware } from '../services/security.js';

const log    = childLogger('router');
export const router = Router();

// Prometheus metrics auth:
//  - dev/test:  no auth (open for local scraping)
//  - prod with METRICS_TOKEN: static Bearer token (standard Prometheus pattern)
//  - prod without METRICS_TOKEN: falls back to JWT security middleware
const _metricsAuth = (() => {
  if (config.NODE_ENV !== 'production') return (_req, _res, next) => next();
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    return (req, res, next) => {
      const auth = req.headers.authorization ?? '';
      if (auth === `Bearer ${metricsToken}`) return next();
      res.status(401).set('WWW-Authenticate', 'Bearer realm="wolf-metrics"').end();
    };
  }
  return makeSecurityMiddleware({ resource: 'metrics', skipRateLimit: true });
})();

// ── Prometheus metrics (internal — restrict in prod via network policy) ────────
router.get('/metrics', _metricsAuth, async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ── Health checks ─────────────────────────────────────────────────────────────
router.get('/health/live', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.get('/health/ready', (_req, res) => {
  const mem     = process.memoryUsage();
  const heapPct = mem.heapUsed / mem.heapTotal;
  if (heapPct > 0.95) {
    return res.status(503).json({
      status: 'degraded', reason: 'memory_pressure', heapPct: heapPct.toFixed(2),
    });
  }
  res.json({ status: 'ok', heapPct: heapPct.toFixed(2), uptime: process.uptime() });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
router.use('/auth', authRouter);

// ── Twilio voice + SMS (HMAC-verified) ────────────────────────────────────────
router.use('/twilio', twilioHmac, voiceRouter);
router.use('/twilio', twilioHmac, smsRouter);

// ── Auto-responder (JWT-protected) ────────────────────────────────────────────
router.get('/tones', (_req, res) => res.json({ tones: getTones() }));

router.post('/reply', requireJwt, validateBody(ReplyBodySchema), async (req, res, next) => {
  const { content, tone } = req.validated;
  try {
    const reply = await autoReply(content, tone);
    res.json({ reply, tone: tone ?? config.SMS_TONE });
  } catch (err) {
    log.error({ err: err.message }, '/reply autoReply failed');
    next(err);
  }
});

// Admin routes are mounted by the application factory in src/api/server.js
