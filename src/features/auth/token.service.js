// src/features/auth/token.service.js — JWT access + refresh token lifecycle.
// Access tokens expire in 15 min; refresh tokens in 7 days.
// Tokens are signed with separate secrets (JWT_SECRET / JWT_REFRESH_SECRET).

<<<<<<< HEAD
import jwt from 'jsonwebtoken';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../core/config.js';
import { childLogger } from '../../core/logger.js';
import { cacheSet, evalScript, isRedisAvailable, cacheDel } from '../../infra/redis/redisClient.js';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GETDEL_LUA_PATH = resolve(__dirname, '../../infra/redis/scripts/getdel.lua');
let _getdelLua = null;
async function _getGetdelLua() {
  if (!_getdelLua) _getdelLua = await readFile(GETDEL_LUA_PATH, 'utf8');
  return _getdelLua;
}

/**
 * Atomically GET-and-DEL a Redis key.
 * Returns the stored value (string) or null when key is absent.
 * Falls back to sequential cacheGet+cacheDel when Redis is unavailable.
 *
 * ⚠️ MULTI-INSTANCE WARNING: the sequential fallback has a replay race window.
 * In production, always run with Redis. Without Redis, two concurrent refresh
 * requests on separate instances can both read the JTI before either deletes it.
 */
async function _atomicGetDel(key) {
  if (isRedisAvailable()) {
    const lua = await _getGetdelLua();
    const result = await evalScript(lua, [key], []);
    return result ?? null;
  }
  // Sequential fallback — safe only in single-process deployments.
  if (process.env.NODE_ENV === 'production') {
    log.warn(
      { key },
      'Redis unavailable in production — refresh token rotation is NOT multi-instance safe'
    );
  }
  const { cacheGet } = await import('../../infra/redis/redisClient.js');
  const val = await cacheGet(key);
  if (val !== null) await cacheDel(key);
  return val;
}

const log = childLogger('auth');

const ACCESS_TTL = 15 * 60; // 15 min (seconds)
=======
import jwt             from 'jsonwebtoken';
import { config }      from '../../core/config.js';
import { childLogger } from '../../core/logger.js';
import { cacheSet, cacheGet, cacheDel } from '../../infra/redis/redisClient.js';
import crypto from 'crypto';

const log = childLogger('auth');

const ACCESS_TTL  = 15 * 60;       // 15 min (seconds)
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
const REFRESH_TTL = 7 * 24 * 3600; // 7 days

/**
 * Issue a short-lived access token and a long-lived refresh token.
 * @param {{ sub: string, role?: string }} payload
 * @returns {{ accessToken: string, refreshToken: string, expiresIn: number }}
 */
export async function issueTokens(payload) {
<<<<<<< HEAD
  const base = {
    sub: payload.sub,
    role: payload.role ?? 'user',
    tenantId: payload.tenantId ?? 'default',
  };
=======
  const base = { sub: payload.sub, role: payload.role ?? 'user' };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  const accessToken = jwt.sign(base, config.JWT_SECRET, {
    expiresIn: ACCESS_TTL,
    algorithm: 'HS256',
  });

<<<<<<< HEAD
  const jti = crypto.randomUUID();
  const refreshToken = jwt.sign(
    { sub: payload.sub, role: base.role, tenantId: base.tenantId, jti },
    config.JWT_REFRESH_SECRET,
    {
      expiresIn: REFRESH_TTL,
      algorithm: 'HS256',
    }
  );
=======
  // Create a refresh token with a jti and store the jti in Redis for revocation checks.
  const jti = crypto.randomUUID();
  const refreshToken = jwt.sign({ sub: payload.sub, jti }, config.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TTL,
    algorithm: 'HS256',
  });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  try {
    await cacheSet(`rt:${jti}`, '1', REFRESH_TTL);
  } catch (err) {
<<<<<<< HEAD
    // Best-effort: if cache unavailable (in-memory fallback active), proceed.
    // In multi-instance deployments without Redis, JTI revocation is not distributed.
=======
    // Best-effort: if cache unavailable, proceed but log.
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
 *
 * Security contract:
 *   1. Verify JWT signature and expiry.
 *   2. Verify JTI exists in Redis (not revoked).
 *   3. Delete the old JTI atomically — if this fails, the rotation is aborted
 *      and no new tokens are issued. This prevents replay when cacheDel errors.
 *   4. Issue new token pair with a fresh JTI.
 *
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
 * @param {string} token
 * @returns {{ accessToken: string, refreshToken: string, expiresIn: number }}
 */
export async function refreshTokens(token) {
  const payload = jwt.verify(token, config.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });

<<<<<<< HEAD
  if (!payload.jti) throw new Error('Missing refresh token id');

  // Steps 2+3: atomically GET and DEL the JTI in a single Redis EVAL.
  // This eliminates the replay race: two concurrent refresh requests cannot
  // both see the JTI as present — only the first EVAL call returns the value.
  // The second caller gets nil and is rejected as 'revoked or already used'.
  let exists;
  try {
    exists = await _atomicGetDel(`rt:${payload.jti}`);
  } catch (err) {
    log.error(
      { err: err.message, jti: payload.jti },
      'Atomic refresh JTI get-del failed — aborting rotation'
    );
    throw new Error('Session rotation failed — please log in again');
  }
  if (!exists) throw new Error('Refresh token revoked or already used');

  // Step 4: issue new token pair.
  const newTokens = await issueTokens({
    sub: payload.sub,
    role: payload.role,
    tenantId: payload.tenantId,
  });
=======
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

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return newTokens;
}
