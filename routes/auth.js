// routes/auth.js — Authentication endpoints.
//
// POST /auth/token   { apiKey } → { accessToken, expiresIn: '15m' }
// POST /auth/refresh            → { accessToken, expiresIn: '15m' }  (reads refreshToken cookie)
// POST /auth/logout             → clears refreshToken cookie
//
// API keys are stored in env as a comma-separated list:
//   API_KEYS=key-abc-123,key-xyz-789
// Generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

import { Router } from 'express';
import { childLogger } from '../utils/logger.js';
import { issueAccessToken, issueRefreshToken, verifyRefreshToken } from '../middleware/auth.js';

const log = childLogger('auth.routes');
export const authRouter = Router();

const COOKIE_NAME = 'wolf_rt';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 3600 * 1000, // 7 days in ms
  path: '/auth',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function validApiKey(key) {
  if (!key) return false;
  const keys = (process.env.API_KEYS ?? '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
  if (!keys.length) {
    // If no API_KEYS configured, accept any non-empty key (dev mode)
    log.warn('API_KEYS not configured — accepting any non-empty key (dev mode)');
    return true;
  }
  return keys.includes(key);
}

// ── POST /auth/token ──────────────────────────────────────────────────────────

authRouter.post('/token', (req, res) => {
  const { apiKey } = req.body ?? {};

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'apiKey is required' });
  }

  if (!validApiKey(apiKey)) {
    log.warn({ ip: req.ip }, 'Invalid API key attempt');
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Use apiKey hash as subject (never store the raw key in the token)
  const sub = apiKey.slice(-8); // last 8 chars as identifier
  const accessToken = issueAccessToken(sub);
  const refreshToken = issueRefreshToken(sub);

  res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);

  log.info({ sub, ip: req.ip }, 'Access token issued');
  res.json({ accessToken, expiresIn: '15m', tokenType: 'Bearer' });
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

authRouter.post('/refresh', (req, res) => {
  const refreshToken = req.cookies?.[COOKIE_NAME];

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token cookie' });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const accessToken = issueAccessToken(payload.sub);
    const newRefresh = issueRefreshToken(payload.sub); // rotate refresh token

    res.cookie(COOKIE_NAME, newRefresh, COOKIE_OPTS);

    log.info({ sub: payload.sub }, 'Token refreshed');
    res.json({ accessToken, expiresIn: '15m', tokenType: 'Bearer' });
  } catch (err) {
    log.warn({ err: err.message }, 'Refresh token invalid');
    res.clearCookie(COOKIE_NAME, { path: '/auth' });
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/auth' });
  log.info({ ip: req.ip }, 'User logged out');
  res.json({ ok: true });
});
