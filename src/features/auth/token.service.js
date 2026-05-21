// src/features/auth/token.service.js — JWT access + refresh token lifecycle.
// Access tokens expire in 15 min; refresh tokens in 7 days.
// Tokens are signed with separate secrets (JWT_SECRET / JWT_REFRESH_SECRET).

import jwt             from 'jsonwebtoken';
import { config }      from '../../core/config.js';
import { childLogger } from '../../core/logger.js';
import { cacheSet, cacheGet, cacheDel } from '../../infra/redis/redisClient.js';
import crypto from 'crypto';

const log = childLogger('auth');

const ACCESS_TTL  = 15 * 60;       // 15 min (seconds)
const REFRESH_TTL = 7 * 24 * 3600; // 7 days

/**
 * Issue a short-lived access token and a long-lived refresh token.
 * @param {{ sub: string, role?: string }} payload
 * @returns {{ accessToken: string, refreshToken: string, expiresIn: number }}
 */
export async function issueTokens(payload) {
  const base = { sub: payload.sub, role: payload.role ?? 'user' };

  const accessToken = jwt.sign(base, config.JWT_SECRET, {
    expiresIn: ACCESS_TTL,
    algorithm: 'HS256',
  });

  // Create a refresh token with a jti and store the jti in Redis for revocation checks.
  const jti = crypto.randomUUID();
  const refreshToken = jwt.sign({ sub: payload.sub, jti }, config.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TTL,
    algorithm: 'HS256',
  });

  try {
    await cacheSet(`rt:${jti}`, '1', REFRESH_TTL);
  } catch (err) {
    // Best-effort: if cache unavailable, proceed but log.
    log.warn({ err: err.message }, 'Failed to persist refresh token jti');
  }

  log.info({ sub: payload.sub, role: base.role }, 'Tokens issued');
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL };
}

/**
 * Verify an access token.
 * @param {string} token
 * @returns {{ sub: string, role: string }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
export function verifyAccess(token) {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
}

/**
 * Verify a refresh token and issue a new token pair.
 * @param {string} token
 * @returns {{ accessToken: string, refreshToken: string, expiresIn: number }}
 */
export async function refreshTokens(token) {
  const payload = jwt.verify(token, config.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });

  // Verify jti still valid (not revoked)
  if (!payload.jti) throw new Error('Missing refresh token id');

  try {
    const exists = await cacheGet(`rt:${payload.jti}`);
    if (!exists) throw new Error('Refresh token revoked');
  } catch (err) {
    log.warn({ err: err.message }, 'Refresh token validation failed');
    throw err;
  }

  // Rotate: issue new pair, persist new jti, remove old jti
  const newTokens = await issueTokens({ sub: payload.sub });

  try {
    // Delete old jti
    await cacheDel(`rt:${payload.jti}`);
  } catch (err) {
    log.warn({ err: err.message }, 'Failed to delete old refresh jti');
  }

  return newTokens;
}
