// src/api/server.js — Express application factory.
// createApp() builds and returns the configured Express app without binding a port.
// server.js (root) calls createApp() then app.listen().
// Tests import createApp() directly — no port conflict.

import express from 'express';
import helmet from 'helmet';
<<<<<<< HEAD
=======
import morgan from 'morgan';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import cookieParser from 'cookie-parser';
import { resolve } from 'path';
import { logger } from '../core/logger.js';
import { config, isProd } from '../core/config.js';
import { cors, audioCors } from './middleware/cors.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { router } from './router.js';
import { adminRouter } from '../features/admin/admin.router.js';
<<<<<<< HEAD
import { i18nMiddleware } from '../core/i18n.js';
import { gdprRouter } from '../features/gdpr/gdpr.router.js';
import { billingRouter } from '../features/billing/billing.router.js';
import { mountSwagger } from './swagger.js';
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

/**
 * Build and return the configured Express application.
 * Does NOT call app.listen() — caller decides when to bind.
 * @returns {import('express').Application}
 */
export function createApp() {
  const app = express();
<<<<<<< HEAD
  // Trust exactly one proxy hop (the load balancer / ingress).
  // 'true' trusts any X-Forwarded-For value, enabling IP spoofing for rate limit bypass.
  app.set('trust proxy', 1);
=======
  app.set('trust proxy', true);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  // ── Security headers ─────────────────────────────────────────────────────────
  app.use(
    helmet({
<<<<<<< HEAD
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              // 'unsafe-inline' removed — it negates XSS protection entirely (C8 fix).
              // If Swagger UI or any page requires inline scripts, use a nonce instead.
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", 'https:'],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'", 'https:'],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
=======
      contentSecurityPolicy: isProd ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", 'https:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https:'],
        },
      } : false,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // ── CORS — strict whitelist on API routes ─────────────────────────────────────
  app.use(cors);

<<<<<<< HEAD
  // ── i18n — language detection from Accept-Language header ────────────────────
  app.use(i18nMiddleware);

  // ── Request ID for log correlation ────────────────────────────────────────────
  app.use(requestId);

  // ── Stripe webhook — mount BEFORE express.json() to preserve raw body ────────
  // The billing router applies express.raw() only on /billing/webhook.
  app.use('/billing', billingRouter);

=======
  // ── Request ID for log correlation ────────────────────────────────────────────
  app.use(requestId);

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  // ── Body parsers ──────────────────────────────────────────────────────────────
  app.use(cookieParser());
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: true, limit: '64kb' }));

<<<<<<< HEAD
  // ── HTTP access log ───────────────────────────────────────────────────────────
  // M6 FIX: Morgan removed. It piped into Pino, creating two log entries per
  // request (one unstructured Morgan string, one from Pino directly). In addition,
  // Morgan logged full URLs including query strings — a PII leak vector when phone
  // numbers appeared in query params. Pino handles structured request logging directly.
  app.use((req, _res, next) => {
    logger.info(
      {
        type: 'http',
        method: req.method,
        path: req.path, // path only — never query string — to avoid PII in logs
        reqId: req.id,
        ip: req.ip,
      },
      'request'
    );
    next();
  });
=======
  // ── HTTP access log (Pino-backed) ─────────────────────────────────────────────
  app.use(
    morgan('combined', {
      stream: { write: msg => logger.info({ type: 'http' }, msg.trim()) },
    })
  );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  // ── HTTPS redirect in production ──────────────────────────────────────────────
  if (isProd) {
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.get('host')}${req.url}`);
      }
      next();
    });
  }

  // ── Static TTS audio (Twilio must reach this without auth) ────────────────────
  app.use(
    '/audio',
    audioCors,
    express.static(resolve(config.AUDIO_DIR), {
      maxAge: '1h',
      etag: true,
    })
  );

  // ── Feature routes ────────────────────────────────────────────────────────────
  app.use('/', router);
  // Mount admin surface separately so it can reside at /admin and be protected.
  app.use('/admin', adminRouter);
<<<<<<< HEAD
  // GDPR compliance endpoints (JWT-protected)
  app.use('/api/user', gdprRouter);
  // OpenAPI docs (Swagger UI at /api-docs, raw spec at /api-docs.json)
  mountSwagger(app);
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  // ── Error handling — must come last ──────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
