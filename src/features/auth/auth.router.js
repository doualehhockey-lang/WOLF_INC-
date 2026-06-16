// src/features/auth/auth.router.js — Express router for auth endpoints.
// Mounts at /auth in src/api/router.js.
<<<<<<< HEAD
//
// CSRF protection:
//   POST /auth/token   — API-key auth only, no cookie read → no CSRF risk
//   POST /auth/refresh — reads wolf_rt cookie → protected by verifyCsrf
//   POST /auth/logout  — reads wolf_rt cookie → protected by verifyCsrf
//   GET  /auth/csrf    — seeds the wolf_csrf double-submit cookie

import { Router } from 'express';
import { handleIssue, handleRefresh, handleLogout, handleSignup } from './auth.controller.js';
import { issueCsrfCookie, verifyCsrf } from '../../api/middleware/csrf.js';
import { rateLimit, makeSecurityMiddleware } from '../../services/security.js';
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  verifyMfaChallenge,
} from './mfa.service.js';
import { db, dbAvailable } from '../../infra/db/dbClient.js';

export const authRouter = Router();

// Rate-limit token issuance by IP — no auth required yet at this stage.
// 10 attempts per minute per IP to prevent API key brute-force.
async function tokenRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const result = await rateLimit(key, { windowSec: 60, maxHits: 10 });
  res.setHeader('X-RateLimit-Limit', 10);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.resetInSec);
  if (!result.allowed) {
    return res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'Too many token requests — please slow down.',
      retryAfter: result.resetInSec,
    });
  }
  next();
}

// Seed the CSRF cookie — call this before the first POST /auth/refresh or /auth/logout.
authRouter.get('/csrf', issueCsrfCookie, (_req, res) => res.json({ ok: true }));

authRouter.post('/token', tokenRateLimit, handleIssue);
authRouter.post('/signup', tokenRateLimit, handleSignup);
authRouter.post('/refresh', verifyCsrf, handleRefresh);
authRouter.post('/logout', verifyCsrf, handleLogout);

// ── MFA endpoints (all require valid JWT) ─────────────────────────────────────

const jwtAuth = makeSecurityMiddleware({ skipRateLimit: true });

// POST /auth/mfa/enroll  — begin TOTP enrollment; returns { secret, uri }
authRouter.post('/mfa/enroll', jwtAuth, async (req, res, next) => {
  if (!dbAvailable) return res.status(503).json({ error: 'DB_UNAVAILABLE' });
  try {
    // req.user.sub may be a JWT sub (email or API key suffix).
    // Look up the operator record by matching sub to email or id.
    const user = await db('operator_users')
      .where(b => b.where('id', req.user.sub).orWhere('email', req.user.sub))
      .select('id', 'email')
      .first();
    if (!user)
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Operator account not found' });
    const result = await beginMfaEnrollment(user.id, user.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/mfa/confirm { code }  — activate MFA; returns { recoveryCodes }
authRouter.post('/mfa/confirm', jwtAuth, async (req, res, next) => {
  if (!dbAvailable) return res.status(503).json({ error: 'DB_UNAVAILABLE' });
  const { code } = req.body ?? {};
  if (!code) return res.status(400).json({ error: 'VALIDATION_ERROR', message: '"code" required' });
  try {
    const user = await db('operator_users')
      .where(b => b.where('id', req.user.sub).orWhere('email', req.user.sub))
      .select('id')
      .first();
    if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
    const result = await confirmMfaEnrollment(user.id, code);
    res.json(result);
  } catch (err) {
    if (err.message === 'Invalid TOTP code')
      return res.status(401).json({ error: 'INVALID_CODE', message: err.message });
    next(err);
  }
});

// POST /auth/mfa/verify { challengeToken, code }  — complete MFA login
authRouter.post('/mfa/verify', tokenRateLimit, async (req, res, next) => {
  const { challengeToken, code } = req.body ?? {};
  if (!challengeToken || !code) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: '"challengeToken" and "code" required' });
  }
  try {
    const operatorId = await verifyMfaChallenge(challengeToken, code);
    const user = await db('operator_users')
      .where({ id: operatorId })
      .select('email', 'role', 'tenant_id')
      .first();
    // Import here to avoid circular dep.
    const { issueTokens } = await import('./token.service.js');
    const { COOKIE_OPTS, COOKIE_NAME } = await import('./auth.controller.js');
    const tokens = await issueTokens({
      sub: user.email,
      role: user.role ?? 'operator',
      tenantId: user.tenant_id,
    });
    res.cookie(COOKIE_NAME, tokens.refreshToken, COOKIE_OPTS);
    res.json({ accessToken: tokens.accessToken, expiresIn: '15m', tokenType: 'Bearer' });
  } catch (err) {
    if (err.message?.includes('expired') || err.message?.includes('Invalid')) {
      return res.status(401).json({ error: 'MFA_FAILED', message: err.message });
    }
    next(err);
  }
});

// DELETE /auth/mfa  — disable MFA (admin only or self)
authRouter.delete(
  '/mfa',
  makeSecurityMiddleware({ resource: 'admin', skipRateLimit: true }),
  async (req, res, next) => {
    if (!dbAvailable) return res.status(503).json({ error: 'DB_UNAVAILABLE' });
    const { operatorId } = req.body ?? {};
    const targetId = operatorId ?? req.user.sub;
    try {
      const user = await db('operator_users')
        .where(b => b.where('id', targetId).orWhere('email', targetId))
        .select('id')
        .first();
      if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
      await disableMfa(user.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);
=======
// No global middleware — each handler validates its own input.

import { Router }        from 'express';
import { handleIssue, handleRefresh, handleLogout } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/token',   handleIssue);
authRouter.post('/refresh', handleRefresh);
authRouter.post('/logout',  handleLogout);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
