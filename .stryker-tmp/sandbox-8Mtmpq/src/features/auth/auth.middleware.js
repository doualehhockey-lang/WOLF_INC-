// @ts-nocheck
// src/features/auth/auth.middleware.js — Bearer JWT + static API key guards.
// Use requireJwt() on user-facing API routes.
// Use requireApiKey() on machine-to-machine service routes.

import { childLogger }   from '../../core/logger.js';
import { apiKeys }       from '../../core/config.js';
import { verifyAccess }  from './token.service.js';

const log = childLogger('auth');

/**
 * Express middleware — requires a valid JWT Bearer token.
 * Sets req.user = { sub, role } on success.
 */
export function requireJwt(req, res, next) {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Bearer token required' });
  }

  const token = auth.slice(7);
  try {
    req.user = verifyAccess(token);
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    log.warn({ code, err: err.message }, 'JWT verification failed');
    res.status(401).json({ error: code, message: err.message });
  }
}

/**
 * Express middleware — requires a valid static API key in X-API-Key header.
 */
export function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] ?? '';
  if (apiKeys.includes(key)) return next();
  log.warn({ keyPrefix: key.slice(0, 6) }, 'Invalid API key');
  res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid API key' });
}
