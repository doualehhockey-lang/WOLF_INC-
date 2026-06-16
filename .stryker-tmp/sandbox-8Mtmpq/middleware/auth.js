// @ts-nocheck
// middleware/auth.js — JWT verification middleware + token utilities.
//
// Auth flow:
//   POST /auth/token  { apiKey }  → { accessToken (15m) }  + cookie refreshToken (7d httpOnly)
//   POST /auth/refresh            → { accessToken }        (reads cookie)
//   POST /auth/logout             → clears cookie
//   GET  /tones                   → public (no auth)
//   POST /reply                   → requires Bearer accessToken

import jwt from 'jsonwebtoken';
import { childLogger } from '../utils/logger.js';

const log = childLogger('auth');

const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';
const ISSUER = 'wolf-engine';

// ── Token helpers ─────────────────────────────────────────────────────────────

export function issueAccessToken(sub) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return jwt.sign({ sub, role: 'user' }, secret, { expiresIn: ACCESS_EXPIRY, issuer: ISSUER });
}

export function issueRefreshToken(sub) {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');
  return jwt.sign({ sub, type: 'refresh' }, secret, { expiresIn: REFRESH_EXPIRY, issuer: ISSUER });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { issuer: ISSUER });
}

export function verifyRefreshToken(token) {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  return jwt.verify(token, secret, { issuer: ISSUER });
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * Require a valid Bearer accessToken.
 * On success, sets req.user = { sub, role }.
 * If JWT_SECRET is not configured, passes through (dev mode).
 */
export function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET) {
    log.warn('JWT_SECRET not set — auth middleware is a no-op (set it for production)');
    req.user = { sub: 'dev', role: 'user' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    log.warn({ err: err.message }, 'JWT verification failed');
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    res.status(401).json({ error: msg });
  }
}

/**
 * Optional auth — sets req.user if token present and valid, else continues.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
  } catch {
    /* ignore */
  }
  next();
}
