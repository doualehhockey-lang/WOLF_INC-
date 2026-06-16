// src/api/middleware/errorHandler.js — Centralized Express error handler.
// Converts AppError subclasses to structured JSON responses.
// Hides internal details from end users in production.
<<<<<<< HEAD
// Uses i18n (req.t) when available for localized error messages.

import { childLogger } from '../../core/logger.js';
import { isUserFacingError } from '../../core/errors.js';
import { config } from '../../core/config.js';

const log = childLogger('error-handler');

// Map AppError codes to i18n keys
const ERROR_I18N_KEYS = {
  VALIDATION_ERROR: 'error.validation',
  NOT_FOUND: 'error.not_found_generic',
  RATE_LIMITED: 'error.rate_limited',
  UNAUTHORIZED: 'error.unauthorized',
  FORBIDDEN: 'error.forbidden',
  EXTERNAL_SERVICE_ERROR: 'error.external_service',
  NLU_ERROR: 'error.nlu_failed',
  TTS_ERROR: 'error.tts_failed',
  DATABASE_ERROR: 'error.db',
  PIPELINE_TIMEOUT: 'error.pipeline_timeout',
  INTERNAL_ERROR: 'error.server',
};

=======

import { childLogger }       from '../../core/logger.js';
import { AppError, isUserFacingError } from '../../core/errors.js';
import { config }            from '../../core/config.js';

const log = childLogger('error-handler');

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
/**
 * Express 4-argument error handler — must come last in middleware chain.
 */
export function errorHandler(err, req, res, _next) {
<<<<<<< HEAD
  const status = err.statusCode ?? err.status ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';
  const context = { reqId: req.id, method: req.method, url: req.url, status };

  if (status >= 500) {
    const stackCtx = config.NODE_ENV !== 'production' ? { stack: err.stack } : {};
    log.error({ ...context, err: err.message, ...stackCtx }, 'Unhandled server error');
=======
  const status  = err.statusCode ?? err.status ?? 500;
  const code    = err.code       ?? 'INTERNAL_ERROR';
  const context = { reqId: req.id, method: req.method, url: req.url, status };

  if (status >= 500) {
    log.error({ ...context, err: err.message, stack: err.stack }, 'Unhandled server error');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  } else {
    log.warn({ ...context, err: err.message }, 'Request error');
  }

<<<<<<< HEAD
  let message;
  if (req.t && ERROR_I18N_KEYS[code]) {
    message = req.t(ERROR_I18N_KEYS[code], {
      message: err.message,
      resource: err.context?.resource,
      seconds: err.retryAfterSec,
      ms: err.context?.timeoutMs,
      service: err.service,
    });
  } else if (isUserFacingError(err) || config.NODE_ENV === 'development') {
    message = err.message;
  } else {
    message = 'Internal server error';
  }
=======
  const message = isUserFacingError(err) || config.NODE_ENV === 'development'
    ? err.message
    : 'Internal server error';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  res.status(status).json({ error: code, message });
}

/**
 * 404 catch-all — must come after all routes.
 */
export function notFound(req, res) {
<<<<<<< HEAD
  const fallback = `${req.method} ${req.path} not found`;
  const message = req.t ? req.t('error.not_found_generic') : fallback;
  res.status(404).json({ error: 'NOT_FOUND', message });
=======
  res.status(404).json({ error: 'NOT_FOUND', message: `${req.method} ${req.path} not found` });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}
