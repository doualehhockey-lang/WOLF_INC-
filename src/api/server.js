// src/api/server.js — Express application factory.
// createApp() builds and returns the configured Express app without binding a port.
// server.js (root) calls createApp() then app.listen().
// Tests import createApp() directly — no port conflict.

import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { resolve } from 'path';
import { logger } from '../core/logger.js';
import { config, isProd } from '../core/config.js';
import { cors, audioCors } from './middleware/cors.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { router } from './router.js';
import { adminRouter } from '../features/admin/admin.router.js';

/**
 * Build and return the configured Express application.
 * Does NOT call app.listen() — caller decides when to bind.
 * @returns {import('express').Application}
 */
export function createApp() {
  const app = express();
  app.set('trust proxy', true);

  // ── Security headers ─────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: isProd ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", 'https:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https:'],
        },
      } : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // ── CORS — strict whitelist on API routes ─────────────────────────────────────
  app.use(cors);

  // ── Request ID for log correlation ────────────────────────────────────────────
  app.use(requestId);

  // ── Body parsers ──────────────────────────────────────────────────────────────
  app.use(cookieParser());
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: true, limit: '64kb' }));

  // ── HTTP access log (Pino-backed) ─────────────────────────────────────────────
  app.use(
    morgan('combined', {
      stream: { write: msg => logger.info({ type: 'http' }, msg.trim()) },
    })
  );

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

  // ── Error handling — must come last ──────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
