// src/features/auth/auth.controller.js — Cookie-based JWT auth endpoints.
//
// POST /auth/token   { apiKey }  → { accessToken, expiresIn: '15m', tokenType: 'Bearer' }
//                                   + HttpOnly cookie wolf_rt (refresh token, 7d)
// POST /auth/refresh             → { accessToken, expiresIn: '15m', tokenType: 'Bearer' }
//                                   (reads wolf_rt cookie, rotates it)
// POST /auth/logout              → clears cookie

<<<<<<< HEAD
import crypto from 'crypto';
import { childLogger } from '../../core/logger.js';
import { apiKeys, config } from '../../core/config.js';
import { issueTokens, refreshTokens } from './token.service.js';
import { cacheDel } from '../../infra/redis/redisClient.js';
import { db, dbAvailable } from '../../infra/db/dbClient.js';
=======
import { childLogger }            from '../../core/logger.js';
import { apiKeys, config }        from '../../core/config.js';
import { issueTokens, refreshTokens, verifyAccess } from './token.service.js';
import { cacheDel } from '../../infra/redis/redisClient.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import jwt from 'jsonwebtoken';

const log = childLogger('auth');

const COOKIE_NAME = 'wolf_rt';
const COOKIE_OPTS = {
  httpOnly: true,
<<<<<<< HEAD
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 3600 * 1_000, // 7 days in ms
  path: '/auth',
};

// ── Timing-safe API key comparison ───────────────────────────────────────────
// apiKeys.includes() exits early on mismatch, leaking prefix length via timing.

function _safeCompareKey(candidate) {
  const bufCand = Buffer.alloc(64);
  Buffer.from(candidate).copy(bufCand);

  let matched = false;
  for (const k of apiKeys) {
    const bufK = Buffer.alloc(64);
    Buffer.from(k).copy(bufK);
    // Always run timingSafeEqual on every key — no short-circuit.
    const eq = crypto.timingSafeEqual(bufK, bufCand) && k.length === candidate.length;
    if (eq) matched = true;
  }
  return matched;
}

=======
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   7 * 24 * 3600 * 1_000, // 7 days in ms
  path:     '/auth',
};

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
// ── POST /auth/token ──────────────────────────────────────────────────────────

export async function handleIssue(req, res) {
  const { apiKey } = req.body ?? {};

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: '"apiKey" is required' });
  }
<<<<<<< HEAD

  if (!_safeCompareKey(apiKey)) {
=======
  if (!apiKeys.includes(apiKey)) {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    log.warn({ ip: req.ip }, 'Invalid API key attempt');
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid API key' });
  }

<<<<<<< HEAD
  // API key holders are operators / admin users — not anonymous end-users.
  // They need the 'admin' role to access GDPR endpoints and admin controls.
  const sub = apiKey.slice(-8);
  const tokens = await issueTokens({ sub, role: 'admin' });
=======
  const sub    = apiKey.slice(-8);
  const tokens = await issueTokens({ sub, role: 'user' });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  res.cookie(COOKIE_NAME, tokens.refreshToken, COOKIE_OPTS);
  log.info({ sub, ip: req.ip }, 'Token issued');

  res.json({
    accessToken: tokens.accessToken,
<<<<<<< HEAD
    expiresIn: '15m',
    tokenType: 'Bearer',
=======
    expiresIn:   '15m',
    tokenType:   'Bearer',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
}

// ── POST /auth/refresh ────────────────────────────────────────────────────────

export async function handleRefresh(req, res) {
  const rt = req.cookies?.[COOKIE_NAME];
  if (!rt) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'No refresh token cookie' });
  }

  try {
    const tokens = await refreshTokens(rt);
    res.cookie(COOKIE_NAME, tokens.refreshToken, COOKIE_OPTS);
    res.json({ accessToken: tokens.accessToken, expiresIn: '15m', tokenType: 'Bearer' });
  } catch (err) {
    log.warn({ err: err.message }, 'Refresh token invalid');
    res.clearCookie(COOKIE_NAME, { path: '/auth' });
    res.status(401).json({ error: 'TOKEN_INVALID', message: err.message });
  }
}

<<<<<<< HEAD
// ── POST /auth/signup ─────────────────────────────────────────────────────────

async function _hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, buf) =>
      err ? reject(err) : resolve(buf.toString('hex'))
    )
  );
  return `$scrypt$${salt}$${hash}`;
}

export async function handleSignup(req, res, next) {
  const { salonName, email, password } = req.body ?? {};

  // Validation
  if (!salonName || typeof salonName !== 'string' || !salonName.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: '"salonName" is required' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: '"email" must be a valid email address' });
  }
  if (!password || password.length < 8) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: '"password" must be at least 8 characters' });
  }

  if (!dbAvailable) {
    return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database not configured' });
  }

  try {
    // Check email uniqueness
    const existing = await db('operator_users').where({ email }).select('id').first();
    if (existing) {
      return res
        .status(409)
        .json({ error: 'EMAIL_TAKEN', message: 'An account with this email already exists' });
    }

    // Create tenant
    const tenantId = crypto.randomUUID();
    await db('tenants').insert({ id: tenantId, name: salonName.trim() });

    // Create operator user
    const password_hash = await _hashPassword(password);
    await db('operator_users').insert({
      email,
      name: salonName.trim(),
      role: 'admin',
      password_hash,
      tenant_id: tenantId,
      is_active: true,
    });

    const tokens = await issueTokens({ sub: email, role: 'admin', tenantId });

    res.cookie(COOKIE_NAME, tokens.refreshToken, COOKIE_OPTS);
    log.info({ email, tenantId, ip: req.ip }, 'New salon signed up');

    res.status(201).json({
      accessToken: tokens.accessToken,
      expiresIn: '15m',
      tokenType: 'Bearer',
      tenantId,
    });
  } catch (err) {
    next(err);
  }
}

=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
// ── POST /auth/logout ─────────────────────────────────────────────────────────

export async function handleLogout(req, res) {
  const rt = req.cookies?.[COOKIE_NAME];
  if (rt) {
    try {
      const payload = jwt.verify(rt, config.JWT_REFRESH_SECRET);
      if (payload?.jti) await cacheDel(`rt:${payload.jti}`);
    } catch (err) {
<<<<<<< HEAD
      // ignore — token may already be invalid or expired
      log.debug({ err: err.message }, 'Logout: refresh token already invalid');
=======
      // ignore — token may already be invalid
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    }
  }

  res.clearCookie(COOKIE_NAME, { path: '/auth' });
  log.info({ ip: req.ip }, 'User logged out');
  res.json({ ok: true });
}
