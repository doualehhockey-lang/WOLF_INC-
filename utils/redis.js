// utils/redis.js — Redis client with transparent in-memory fallback.
// If REDIS_URL is not set, every operation degrades gracefully to a Map/noop.
// This lets the app run in development without Redis installed.

import { childLogger } from './logger.js';

const log = childLogger('redis');

// ── Real Redis client ─────────────────────────────────────────────────────────

let _redis = null;
let _available = false;

if (process.env.REDIS_URL) {
  try {
    // Dynamic import so the app starts even if ioredis isn't installed yet
    const { default: Redis } = await import('ioredis');

    _redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: times => Math.min(times * 100, 3000),
      lazyConnect: true,
      enableReadyCheck: true,
    });

    await _redis.connect();
    await _redis.ping();
    _available = true;
    log.info({ url: process.env.REDIS_URL.replace(/:\/\/.*@/, '://***@') }, 'Redis connected');

    _redis.on('error', err => log.error({ err: err.message }, 'Redis error'));
    _redis.on('reconnecting', () => log.warn('Redis reconnecting…'));
  } catch (err) {
    log.warn({ err: err.message }, 'Redis unavailable — falling back to in-memory');
    _redis = null;
    _available = false;
  }
} else {
  log.info('REDIS_URL not set — using in-memory fallback (set REDIS_URL to enable Redis)');
}

export const redis = _redis;
export const redisAvailable = _available;

// ── In-memory stub (when Redis is unavailable) ────────────────────────────────
// Mimics the subset of ioredis API we use: get/set/setex/del/incr/expire/ttl/getBuffer

const _store = new Map(); // key → { value, expiresAt }

function _isExpired(entry) {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}

function _get(key) {
  const e = _store.get(key);
  if (!e || _isExpired(e)) {
    _store.delete(key);
    return null;
  }
  return e.value;
}

function _set(key, value, ttlSec = null) {
  _store.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null });
}

// Periodic cleanup of expired keys (prevent unbounded growth)
setInterval(() => {
  for (const [k, e] of _store) if (_isExpired(e)) _store.delete(k);
}, 60_000).unref();

// ── Unified helpers (work with both Redis and in-memory) ──────────────────────
// Use these instead of raw redis calls so fallback is automatic.

export async function cacheGet(key) {
  if (_available) return _redis.get(key);
  return _get(key);
}

export async function cacheGetBuffer(key) {
  if (_available) return _redis.getBuffer(key);
  const v = _get(key);
  return v !== null && v !== undefined ? Buffer.from(v) : null;
}

export async function cacheSet(key, value, ttlSec = null) {
  if (_available) {
    if (ttlSec) return _redis.setex(key, ttlSec, value);
    return _redis.set(key, value);
  }
  _set(key, value, ttlSec);
}

export async function cacheSetBuffer(key, buf, ttlSec = null) {
  if (_available) {
    if (ttlSec) return _redis.setex(key, ttlSec, buf);
    return _redis.set(key, buf);
  }
  _set(key, buf, ttlSec);
}

export async function cacheDel(key) {
  if (_available) return _redis.del(key);
  _store.delete(key);
}

export async function cacheIncr(key) {
  if (_available) return _redis.incr(key);
  const current = Number(_get(key) ?? 0) + 1;
  const existing = _store.get(key);
  _store.set(key, { value: String(current), expiresAt: existing?.expiresAt ?? null });
  return current;
}

export async function cacheExpire(key, ttlSec) {
  if (_available) return _redis.expire(key, ttlSec);
  const existing = _store.get(key);
  if (existing) existing.expiresAt = Date.now() + ttlSec * 1000;
}

export async function cacheTtl(key) {
  if (_available) return _redis.ttl(key);
  const e = _store.get(key);
  if (!e || e.expiresAt === null) return -1;
  return Math.max(0, Math.ceil((e.expiresAt - Date.now()) / 1000));
}
