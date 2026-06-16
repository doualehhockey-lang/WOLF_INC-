// src/features/auth/auth.middleware.js — Bearer JWT + static API key guards.
// Use requireJwt() on user-facing API routes.
// Use requireApiKey() on machine-to-machine service routes.
<<<<<<< HEAD
// Use requireRole(...roles) after requireJwt to enforce RBAC.

import crypto from 'crypto';
import { childLogger } from '../../core/logger.js';
import { apiKeys } from '../../core/config.js';
import { verifyAccess } from './token.service.js';

const log = childLogger('auth');

// ── Timing-safe key comparison ────────────────────────────────────────────────
// Array.includes / string equality exit early on mismatch, leaking key length
// and prefix via timing. timingSafeEqual pads to a fixed comparison length.

function _safeCompare(a, b) {
  // Always allocate equal-length buffers to prevent length oracle.
  const bufA = Buffer.alloc(64);
  const bufB = Buffer.alloc(64);
  Buffer.from(a).copy(bufA);
  Buffer.from(b).copy(bufB);
  return crypto.timingSafeEqual(bufA, bufB) && a.length === b.length;
}

// ── requireJwt ────────────────────────────────────────────────────────────────

=======

import { childLogger }   from '../../core/logger.js';
import { apiKeys }       from '../../core/config.js';
import { verifyAccess }  from './token.service.js';

const log = childLogger('auth');

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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

<<<<<<< HEAD
// ── requireRole ───────────────────────────────────────────────────────────────

/**
 * Express middleware — requires req.user.role to be one of the allowed roles.
 * Must be used AFTER requireJwt (depends on req.user being set).
 *
 * @param {...string} roles — allowed roles, e.g. requireRole('admin')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      // Guard against being called without requireJwt in the chain.
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Bearer token required' });
    }
    if (!roles.includes(req.user.role)) {
      log.warn({ role: req.user.role, required: roles, sub: req.user.sub }, 'RBAC: access denied');
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Role '${req.user.role}' is not authorized for this resource`,
      });
    }
    next();
  };
}

// ── requireApiKey ─────────────────────────────────────────────────────────────

/**
 * Express middleware — requires a valid static API key in X-API-Key header.
 * Uses timing-safe comparison to prevent key enumeration via timing attacks.
 */
export function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] ?? '';

  // Iterate all keys with timing-safe compare — never short-circuit on first match.
  const valid = apiKeys.some(k => _safeCompare(k, key));

  if (valid) return next();
=======
/**
 * Express middleware — requires a valid static API key in X-API-Key header.
 */
export function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] ?? '';
  if (apiKeys.includes(key)) return next();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  log.warn({ keyPrefix: key.slice(0, 6) }, 'Invalid API key');
  res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid API key' });
}
