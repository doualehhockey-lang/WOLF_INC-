// src/infra/redis/redisClient.js — ioredis client with transparent in-memory fallback.
// If REDIS_URL is not set, every operation degrades gracefully to a Map/noop.
// Instruments hit/miss via Prometheus and logs connection lifecycle with Pino.
// All helpers are safe to await in any context — real Redis or fallback.

<<<<<<< HEAD
import { childLogger } from '../../core/logger.js';
import { rateLimitCounter as _rateLimitCounter } from '../../core/metrics.js';
=======
import { childLogger }      from '../../core/logger.js';
import { rateLimitCounter } from '../../core/metrics.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

const log = childLogger('redis');

// ── Real Redis client ─────────────────────────────────────────────────────────

<<<<<<< HEAD
let _redis = null;
=======
let _redis     = null;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
let _available = false;

if (process.env.REDIS_URL) {
  try {
    const { default: Redis } = await import('ioredis');

    _redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
<<<<<<< HEAD
      retryStrategy: times => Math.min(times * 100, 3_000),
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 5_000,
      commandTimeout: 2_000, // individual command timeout — prevents slow Redis blocking pipelines
=======
      retryStrategy:        times => Math.min(times * 100, 3_000),
      lazyConnect:          true,
      enableReadyCheck:     true,
      connectTimeout:       5_000,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });

    await _redis.connect();
    await _redis.ping();
    _available = true;

    const safeUrl = process.env.REDIS_URL.replace(/:\/\/[^@]*@/, '://***@');
    log.info({ url: safeUrl }, 'Redis connected');

<<<<<<< HEAD
    _redis.on('error', err => log.error({ err: err.message }, 'Redis error'));
    _redis.on('reconnecting', () => log.warn('Redis reconnecting…'));
    _redis.on('ready', () => {
      _available = true;
      log.info('Redis ready');
    });
    _redis.on('close', () => {
      _available = false;
      log.warn('Redis connection closed');
    });
  } catch (err) {
    log.warn({ err: err.message }, 'Redis unavailable — falling back to in-memory');
    _redis = null;
=======
    _redis.on('error',       err => log.error({ err: err.message }, 'Redis error'));
    _redis.on('reconnecting',    () => log.warn('Redis reconnecting…'));
    _redis.on('ready',           () => { _available = true;  log.info('Redis ready'); });
    _redis.on('close',           () => { _available = false; log.warn('Redis connection closed'); });
  } catch (err) {
    log.warn({ err: err.message }, 'Redis unavailable — falling back to in-memory');
    _redis     = null;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    _available = false;
  }
} else {
  log.info('REDIS_URL not set — using in-memory fallback');
}

/** Raw ioredis instance — null when running in fallback mode. */
<<<<<<< HEAD
export const redis = _redis;

/**
 * True when a real Redis connection is currently active.
 *
 * M4 FIX: Previously exported as `export const redisAvailable = _available` which
 * captured the boolean by value at module load time. After a Redis disconnect or
 * reconnect, the exported constant never updated — callers saw stale state.
 *
 * This getter reads `_available` on every call, so it reflects the live
 * connection state. All callers (rate-limiter, security, health probe) now get
 * accurate information after Redis reconnects or goes down post-startup.
 *
 * @returns {boolean}
 */
export function isRedisAvailable() {
  return _available;
}

/**
 * @deprecated Use isRedisAvailable() — this constant is frozen at startup and
 * does not update when Redis disconnects or reconnects.
 */
=======
export const redis          = _redis;
/** True when a real Redis connection is active. */
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
export const redisAvailable = _available;

// ── In-memory fallback ────────────────────────────────────────────────────────
// Covers: get / set / setex / del / incr / expire / ttl / getBuffer
// Keys are auto-evicted on access if TTL has elapsed.

const _store = new Map(); // key → { value: string|Buffer, expiresAt: number|null }

function _expired(entry) {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}

function _memGet(key) {
  const e = _store.get(key);
<<<<<<< HEAD
  if (!e || _expired(e)) {
    _store.delete(key);
    return null;
  }
=======
  if (!e || _expired(e)) { _store.delete(key); return null; }
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return e.value;
}

/* c8 ignore next 1 — _memSet is always called by cacheSet/cacheSetBuffer which always pass ttlSec; the null default is never triggered */
function _memSet(key, value, ttlSec = null) {
  _store.set(key, {
    value,
    expiresAt: ttlSec ? Date.now() + ttlSec * 1_000 : null,
  });
}

// Periodic GC — prevent unbounded growth in long-lived processes.
setInterval(() => {
  for (const [k, e] of _store) if (_expired(e)) _store.delete(k);
}, 60_000).unref();

// ── Unified cache helpers ─────────────────────────────────────────────────────
// Always use these instead of calling _redis directly — fallback is transparent.

export async function cacheGet(key) {
  return _available ? _redis.get(key) : _memGet(key);
}

export async function cacheGetBuffer(key) {
  if (_available) return _redis.getBuffer(key);
  const v = _memGet(key);
<<<<<<< HEAD
  return v !== null && v !== undefined ? Buffer.from(v) : null;
=======
  return v != null ? Buffer.from(v) : null;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}

export async function cacheSet(key, value, ttlSec = null) {
  if (_available) return ttlSec ? _redis.setex(key, ttlSec, value) : _redis.set(key, value);
  _memSet(key, value, ttlSec);
}

export async function cacheSetBuffer(key, buf, ttlSec = null) {
  if (_available) return ttlSec ? _redis.setex(key, ttlSec, buf) : _redis.set(key, buf);
  _memSet(key, buf, ttlSec);
}

export async function cacheDel(key) {
  if (_available) return _redis.del(key);
  _store.delete(key);
}

export async function cacheIncr(key) {
  if (_available) return _redis.incr(key);
<<<<<<< HEAD
  const current = Number(_memGet(key) ?? 0) + 1;
=======
  const current  = Number(_memGet(key) ?? 0) + 1;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const existing = _store.get(key);
  _store.set(key, { value: String(current), expiresAt: existing?.expiresAt ?? null });
  return current;
}

export async function cacheExpire(key, ttlSec) {
  if (_available) return _redis.expire(key, ttlSec);
  const existing = _store.get(key);
  if (existing) existing.expiresAt = Date.now() + ttlSec * 1_000;
}

export async function cacheTtl(key) {
  if (_available) return _redis.ttl(key);
  const e = _store.get(key);
  if (!e || e.expiresAt === null) return -1;
  return Math.max(0, Math.ceil((e.expiresAt - Date.now()) / 1_000));
}

// ── Lua script runner ─────────────────────────────────────────────────────────
// Executes atomic scripts via EVAL; no-op when running in fallback mode.

/**
 * Run a Lua script atomically.
 * @param {string}   script  — Lua source
 * @param {string[]} keys
 * @param {string[]} args
 * @returns {Promise<*>} Redis reply, or null in fallback mode.
 */
export async function evalScript(script, keys = [], args = []) {
  if (!_available) return null;
  return _redis.eval(script, keys.length, ...keys, ...args);
}
