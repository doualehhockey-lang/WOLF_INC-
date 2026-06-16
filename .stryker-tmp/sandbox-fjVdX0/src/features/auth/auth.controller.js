// @ts-nocheck
// src/features/auth/auth.controller.js — Cookie-based JWT auth endpoints.
//
// POST /auth/token   { apiKey }  → { accessToken, expiresIn: '15m', tokenType: 'Bearer' }
//                                   + HttpOnly cookie wolf_rt (refresh token, 7d)
// POST /auth/refresh             → { accessToken, expiresIn: '15m', tokenType: 'Bearer' }
//                                   (reads wolf_rt cookie, rotates it)
// POST /auth/logout              → clears cookie

import { childLogger }            from '../../core/logger.js';
import { apiKeys, config }        from '../../core/config.js';
import { issueTokens, refreshTokens, verifyAccess } from './token.service.js';
import { cacheDel } from '../../infra/redis/redisClient.js';
import jwt from 'jsonwebtoken';

const log = childLogger('auth');

const COOKIE_NAME = 'wolf_rt';
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   7 * 24 * 3600 * 1_000, // 7 days in ms
  path:     '/auth',
};

// ── POST /auth/token ──────────────────────────────────────────────────────────

export async function handleIssue(req, res) {
  const { apiKey } = req.body ?? {};

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: '"apiKey" is required' });
  }
  if (!apiKeys.includes(apiKey)) {
    log.warn({ ip: req.ip }, 'Invalid API key attempt');
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid API key' });
  }

  const sub    = apiKey.slice(-8);
  const tokens = await issueTokens({ sub, role: 'user' });

  res.cookie(COOKIE_NAME, tokens.refreshToken, COOKIE_OPTS);
  log.info({ sub, ip: req.ip }, 'Token issued');

  res.json({
    accessToken: tokens.accessToken,
    expiresIn:   '15m',
    tokenType:   'Bearer',
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

// ── POST /auth/logout ─────────────────────────────────────────────────────────

export async function handleLogout(req, res) {
  const rt = req.cookies?.[COOKIE_NAME];
  if (rt) {
    try {
      const payload = jwt.verify(rt, config.JWT_REFRESH_SECRET);
      if (payload?.jti) await cacheDel(`rt:${payload.jti}`);
    } catch (err) {
      // ignore — token may already be invalid
    }
  }

  res.clearCookie(COOKIE_NAME, { path: '/auth' });
  log.info({ ip: req.ip }, 'User logged out');
  res.json({ ok: true });
}
