// src/api/middleware/errorHandler.js — Centralized Express error handler.
// Converts AppError subclasses to structured JSON responses.
// Hides internal details from end users in production.

import { childLogger }       from '../../core/logger.js';
import { AppError, isUserFacingError } from '../../core/errors.js';
import { config }            from '../../core/config.js';

const log = childLogger('error-handler');

/**
 * Express 4-argument error handler — must come last in middleware chain.
 */
export function errorHandler(err, req, res, _next) {
  const status  = err.statusCode ?? err.status ?? 500;
  const code    = err.code       ?? 'INTERNAL_ERROR';
  const context = { reqId: req.id, method: req.method, url: req.url, status };

  if (status >= 500) {
    log.error({ ...context, err: err.message, stack: err.stack }, 'Unhandled server error');
  } else {
    log.warn({ ...context, err: err.message }, 'Request error');
  }

  const message = isUserFacingError(err) || config.NODE_ENV === 'development'
    ? err.message
    : 'Internal server error';

  res.status(status).json({ error: code, message });
}

/**
 * 404 catch-all — must come after all routes.
 */
export function notFound(req, res) {
  res.status(404).json({ error: 'NOT_FOUND', message: `${req.method} ${req.path} not found` });
}
