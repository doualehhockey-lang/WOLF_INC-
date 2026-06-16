// src/api/middleware/csrf.js — Double-submit cookie CSRF protection.

import crypto from 'crypto';

const CSRF_COOKIE = 'wolf_csrf';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Issue a CSRF token cookie.
 * Uses double-submit pattern: cookie is set httpOnly: false so JS can read it,
 * then submit it in a header that we verify on the server.
 */
export function issueCsrfCookie(_req, res, next) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // JS must read it for double-submit
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 3600 * 1000, // 1 hour
  });
  next();
}

/**
 * Verify the CSRF token (cookie must match header).
 */
export function verifyCsrf(req, res, next) {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF_MISSING', message: 'CSRF token required' });
  }

  // Timing-safe comparison
  const bufA = Buffer.alloc(64);
  const bufB = Buffer.alloc(64);
  Buffer.from(cookieToken).copy(bufA);
  Buffer.from(headerToken).copy(bufB);

  if (!crypto.timingSafeEqual(bufA, bufB) || cookieToken.length !== headerToken.length) {
    return res.status(403).json({ error: 'CSRF_INVALID', message: 'CSRF token mismatch' });
  }

  next();
}
