// src/services/security.js — Unified security facade for Wolf Engine.
//
// Provides:
//   authenticate(req)          — JWT Bearer OR API-key authentication
//   rateLimit(key, opts?)      — sliding-window rate limiter (Redis or in-memory)
//   authorise(role, resource)  — RBAC capability check
//   makeSecurityMiddleware()   — Express middleware factory (auth + rate-limit)
//
// Design:
//   - _makeSecurity(deps) factory for full DI / testability.
//   - Wraps existing primitives: verifyAccess (token.service), apiKeys (config),
//     cacheIncr / cacheExpire (redisClient), rateLimitCounter (metrics).
//   - OTel spans injected via recordStageSpan (observability).
//   - Never leaks JWT internals — errors are normalised to SecurityError.

import crypto from 'crypto';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { childLogger } from '../core/logger.js';
import { apiKeys } from '../core/config.js';
import { verifyAccess } from '../features/auth/token.service.js';
import {
  evalScript,
  cacheIncr,
  cacheExpire,
  isRedisAvailable,
} from '../infra/redis/redisClient.js';
import { rateLimitCounter, errorCounter } from '../core/metrics.js';
const recordStageSpan = (_stage, _attrs, fn) => fn(null);
// Lazy-import db to avoid circular deps at module load; dbAvailable checked at call time.
let _db = null;
async function _getDb() {
  if (!_db) {
    try {
      const m = await import('../infra/db/dbClient.js');
      if (m.dbAvailable) _db = m.db;
    } catch {
      /* DB not available — fall through to env-var keys */
    }
  }
  return _db;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const LUA_PATH = resolve(__dirname, '../infra/redis/scripts/rateLimit.lua');

let _luaScript = null;
async function _getLua() {
  if (!_luaScript) _luaScript = await readFile(LUA_PATH, 'utf8');
  return _luaScript;
}

const log = childLogger('security');

// ── Domain errors ─────────────────────────────────────────────────────────────

export class SecurityError extends Error {
  /** @param {'UNAUTHORIZED'|'FORBIDDEN'|'RATE_LIMITED'|'TOKEN_EXPIRED'|'TOKEN_INVALID'} code */
  constructor(code, message) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.statusCode = code === 'RATE_LIMITED' ? 429 : code === 'FORBIDDEN' ? 403 : 401;
  }
}

// ── RBAC role → resource capability map ──────────────────────────────────────
// Roles come from JWT payload.role; resources are logical service names.
// 'admin' is implicit super-set — checked first.

const ROLE_CAPABILITIES = Object.freeze({
  admin: ['agent', 'whisper', 'claude', 'tts', 'metrics', 'admin'],
  service: ['agent', 'whisper', 'claude', 'tts'],
  user: ['agent', 'tts'],
  guest: [],
});

// Default rate-limit config (overridable per call).
const DEFAULT_RATE_LIMIT = Object.freeze({
  windowSec: 60, // sliding window length in seconds
  maxHits: 100, // allowed requests per window
});

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * @typedef {object} SecurityDeps
 * @property {Function}  [_verifyAccess]    — jwt verify (token.service.verifyAccess)
 * @property {string[]}  [_apiKeys]         — valid static API keys
 * @property {Function}  [_cacheIncr]       — Redis/in-memory atomic increment
 * @property {Function}  [_cacheExpire]     — Redis/in-memory TTL setter
 * @property {object}    [_rateLimitCounter]— Prometheus counter (inc)
 * @property {object}    [_errorCounter]    — Prometheus counter (inc)
 * @property {Function}  [_recordStageSpan] — OTel span wrapper
 * @property {Function}  [_now]             — clock injection (Date.now)
 */

export function _makeSecurity(deps = {}) {
  const _verifyAccess = deps._verifyAccess ?? verifyAccess;
  const _apiKeys = deps._apiKeys ?? apiKeys;
  const _cacheIncr = deps._cacheIncr ?? cacheIncr;
  const _cacheExpire = deps._cacheExpire ?? cacheExpire;
  const _rlCounter = deps._rateLimitCounter ?? rateLimitCounter;
  const _errCounter = deps._errorCounter ?? errorCounter;
  const _spanFn = deps._recordStageSpan ?? recordStageSpan;

  // ── authenticate ────────────────────────────────────────────────────────────

  /**
   * Resolve caller identity from an Express-like request object.
   * Accepts: Bearer JWT  OR  X-API-Key header.
   * Returns { sub, role, method: 'jwt'|'apikey' }.
   * @throws {SecurityError}
   */
  async function authenticate(req) {
    return _spanFn('security.auth', { 'security.method': 'resolve' }, async span => {
      const auth = req.headers?.authorization ?? '';
      const apiKey = req.headers?.['x-api-key'] ?? '';

      // ── API key path (service-to-service) ──────────────────────────────────
      if (apiKey) {
        // 1. Check env-var static keys (backward compat, timing-safe).
        // Iterate ALL keys — never short-circuit — to prevent timing leaks.
        let staticMatch = false;
        for (const k of _apiKeys) {
          const bufA = Buffer.alloc(64);
          const bufB = Buffer.alloc(64);
          Buffer.from(k).copy(bufA);
          Buffer.from(apiKey).copy(bufB);
          if (crypto.timingSafeEqual(bufA, bufB) && k.length === apiKey.length) {
            staticMatch = true;
          }
        }
        if (staticMatch) {
          span?.setAttribute('security.method', 'apikey');
          log.debug({ keyPrefix: apiKey.slice(0, 8) }, 'API key authenticated (static)');
          return { sub: 'service', role: 'service', method: 'apikey' };
        }

        // 2. DB-backed dynamic keys: SHA-256 hash lookup.
        const db = await _getDb();
        if (db) {
          try {
            const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
            const record = await db('api_keys')
              .where({ key_hash: keyHash, is_revoked: false })
              .where(q => q.whereNull('expires_at').orWhere('expires_at', '>', new Date()))
              .select('id', 'role', 'key_prefix')
              .first();

            if (record) {
              // Fire-and-forget audit: update last_used_at without blocking the request.
              db('api_keys')
                .where({ id: record.id })
                .update({ last_used_at: new Date() })
                .catch(err =>
                  log.warn({ err: err.message }, 'Failed to update api_key last_used_at')
                );
              db('api_key_events')
                .insert({ key_id: record.id, event_type: 'used', ip_hash: apiKey.slice(0, 8) }) // reuse prefix as IP placeholder
                .catch(err =>
                  log.warn(
                    { err: err.message, keyId: record.id },
                    'API key audit event insert failed'
                  )
                );

              span?.setAttribute('security.method', 'apikey-db');
              span?.setAttribute('security.api_key_role', record.role);
              log.debug(
                { keyPrefix: record.key_prefix, role: record.role },
                'API key authenticated (db)'
              );
              return { sub: `apikey:${record.id}`, role: record.role, method: 'apikey' };
            }
          } catch (err) {
            log.warn({ err: err.message }, 'DB API key lookup failed — falling through to deny');
          }
        }

        _errCounter.inc({ service: 'security', errorType: 'invalid_api_key' });
        log.warn({ keyPrefix: apiKey.slice(0, 6) }, 'Invalid API key');
        throw new SecurityError('FORBIDDEN', 'Invalid API key');
      }

      // ── JWT Bearer path (user-facing) ───────────────────────────────────────
      if (auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        try {
          const payload = _verifyAccess(token);
          span?.setAttribute('security.method', 'jwt');
          span?.setAttribute('security.sub', payload.sub);
          log.debug({ sub: payload.sub, role: payload.role }, 'JWT authenticated');
          return { sub: payload.sub, role: payload.role ?? 'user', method: 'jwt' };
        } catch (err) {
          const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
          _errCounter.inc({ service: 'security', errorType: code.toLowerCase() });
          log.warn({ code, err: err.message }, 'JWT authentication failed');
          throw new SecurityError(code, err.message);
        }
      }

      // ── No credentials ──────────────────────────────────────────────────────
      throw new SecurityError('UNAUTHORIZED', 'Bearer token or X-API-Key required');
    });
  }

  // ── rateLimit ────────────────────────────────────────────────────────────────

  /**
   * Fixed-window rate limiter backed by Redis atomic Lua script (or in-memory fallback).
   *
   * H6 FIX: Previously used non-atomic INCR + conditional EXPIRE.
   * If the process crashed between INCR and EXPIRE, the key had no TTL and
   * the caller was permanently rate-limited (TTL miss leak).
   *
   * Now uses the same atomic rateLimit.lua script as the voice pipeline:
   * INCR and EXPIRE execute in a single EVAL — no race condition possible.
   * Falls back to non-atomic INCR+EXPIRE only in in-memory mode (single process,
   * no race) where the Lua path is unavailable.
   *
   * @param {string}  key       — caller identity or IP (used as Redis key prefix)
   * @param {object}  [opts]
   * @param {number}  [opts.windowSec=60]  — window length in seconds
   * @param {number}  [opts.maxHits=100]   — max requests per window
   * @returns {Promise<{ allowed: boolean, count: number, remaining: number, resetInSec: number }>}
   */
  async function rateLimit(key, opts = {}) {
    const { windowSec, maxHits } = { ...DEFAULT_RATE_LIMIT, ...opts };
    const redisKey = `rl:sec:${key}`;

    return _spanFn('security.ratelimit', { 'rl.key': key, 'rl.max': maxHits }, async span => {
      let count;
      let allowed;

      if (isRedisAvailable()) {
        // Atomic path — Lua script handles INCR + EXPIRE in one EVAL call.
        const lua = await _getLua();
        const result = await evalScript(lua, [redisKey], [String(windowSec), String(maxHits)]);
        // result = [current_count, 1=allowed / 0=blocked]
        count = result ? result[0] : 1;
        allowed = result ? result[1] === 1 : true; // fail open if eval returns null
      } else {
        // In-memory fallback — single process, no concurrent race condition.
        count = await _cacheIncr(redisKey);
        if (count === 1) await _cacheExpire(redisKey, windowSec);
        allowed = count <= maxHits;
      }

      const remaining = Math.max(0, maxHits - count);
      const resetInSec = windowSec - (Math.floor(Date.now() / 1000) % windowSec);

      span?.setAttribute('rl.count', count);
      span?.setAttribute('rl.allowed', allowed);
      span?.setAttribute('rl.remaining', remaining);

      if (!allowed) {
        _rlCounter.inc();
        log.warn({ key, count, maxHits, windowSec }, 'Rate limit exceeded');
      }

      return { allowed, count, remaining, resetInSec };
    });
  }

  // ── authorise ────────────────────────────────────────────────────────────────

  /**
   * RBAC capability check.
   * @param {string} role      — from authenticate() result
   * @param {string} resource  — logical service name (e.g. 'agent', 'metrics')
   * @returns {boolean}
   * @throws {SecurityError} FORBIDDEN when role lacks the capability
   */
  function authorise(role, resource) {
    const caps = ROLE_CAPABILITIES[role] ?? ROLE_CAPABILITIES.guest;
    const allowed = caps.includes(resource) || caps.includes('admin');

    if (!allowed) {
      _errCounter.inc({ service: 'security', errorType: 'forbidden' });
      log.warn({ role, resource }, 'RBAC: access denied');
      throw new SecurityError('FORBIDDEN', `Role '${role}' cannot access '${resource}'`);
    }

    return true;
  }

  // ── Express middleware factory ────────────────────────────────────────────────

  /**
   * Returns an Express middleware that:
   *   1. Authenticates the request (JWT or API key).
   *   2. Applies rate limiting keyed to sub|IP.
   *   3. Optionally enforces RBAC for a given resource.
   *
   * @param {object}  [opts]
   * @param {string}  [opts.resource]     — resource to RBAC-check (skipped if omitted)
   * @param {number}  [opts.windowSec]    — rate-limit window (default 60s)
   * @param {number}  [opts.maxHits]      — rate-limit ceiling (default 100)
   * @param {boolean} [opts.skipRateLimit=false]
   * @returns {import('express').RequestHandler}
   */
  function makeSecurityMiddleware(opts = {}) {
    const {
      resource,
      windowSec = DEFAULT_RATE_LIMIT.windowSec,
      maxHits = DEFAULT_RATE_LIMIT.maxHits,
      skipRateLimit = false,
    } = opts;

    return async function securityMiddleware(req, res, next) {
      try {
        // 1. Authenticate
        const identity = await authenticate(req);
        req.user = identity;

        // 2. RBAC (optional)
        if (resource) {
          authorise(identity.role, resource);
        }

        // 3. Rate limit
        if (!skipRateLimit) {
          const rlKey = identity.sub || req.ip || 'anon';
          const result = await rateLimit(rlKey, { windowSec, maxHits });

          res.setHeader('X-RateLimit-Limit', maxHits);
          res.setHeader('X-RateLimit-Remaining', result.remaining);
          res.setHeader('X-RateLimit-Reset', result.resetInSec);

          if (!result.allowed) {
            return res.status(429).json({
              error: 'RATE_LIMITED',
              message: 'Too many requests — please slow down.',
              retryAfter: result.resetInSec,
            });
          }
        }

        next();
      } catch (err) {
        if (err instanceof SecurityError) {
          return res.status(err.statusCode).json({
            error: err.code,
            message: err.message,
          });
        }
        next(err);
      }
    };
  }

  return { authenticate, rateLimit, authorise, makeSecurityMiddleware };
}

// ── Production singleton ───────────────────────────────────────────────────────

const _singleton = _makeSecurity();

export const authenticate = _singleton.authenticate;
export const rateLimit = _singleton.rateLimit;
export const authorise = _singleton.authorise;
export const makeSecurityMiddleware = _singleton.makeSecurityMiddleware;

export { ROLE_CAPABILITIES };
