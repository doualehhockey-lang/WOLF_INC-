// src/core/featureFlags.js — Runtime feature flags backed by Redis.
//
// Kill switches for every major subsystem — no restart required.
// All flags default to ENABLED. Set a flag to '0' in Redis to disable it.
//
// Usage:
//   import { isEnabled, FLAGS } from './featureFlags.js';
//   if (await isEnabled(FLAGS.CLAUDE_NLU)) { ... }
//
// Admin (Redis CLI):
//   SETEX ff:wolf:claude.nlu 86400 0    # disable Claude NLU for 24h
//   DEL   ff:wolf:claude.nlu             # re-enable (back to default)
//
// Design:
//   - In-memory LRU-like cache per flag (TTL: FLAG_CACHE_TTL_MS)
//   - Redis miss → default value (fail open)
//   - setFlag() writes to Redis + invalidates local cache
//   - Prometheus counter tracks flag checks per name+outcome

import { childLogger } from './logger.js';

// ── Lazy Redis access ─────────────────────────────────────────────────────────
// redisClient.js statically imports `rateLimitCounter` from metrics.js.
// A static import here would pull that dependency into every file that imports
// featureFlags.js — breaking tests that mock metrics.js without rateLimitCounter.
// Dynamic import is cached after the first resolution (same as static import
// from a module-graph perspective), so there is no per-call overhead.

let _redisModule = null;

async function _getRedis() {
  if (!_redisModule) _redisModule = await import('../infra/redis/redisClient.js');
  return _redisModule;
}

async function _redisGet(key) {
  try {
    const m = await _getRedis();
    return m.cacheGet?.(key) ?? null;
  } catch {
    return null; // Redis module failed to load — fall back to defaults
  }
}

async function _redisSet(key, value, ttl) {
  try {
    const m = await _getRedis();
    return m.cacheSet?.(key, value, ttl);
  } catch {
    /* ignore — flag will expire from local cache */
  }
}

async function _redisPublish(channel, message) {
  try {
    const m = await _getRedis();
    // redis is the raw ioredis client; null in fallback mode
    return m.redis?.publish(channel, message);
  } catch {
    /* ignore — pub/sub is a best-effort propagation mechanism */
  }
}

const log = childLogger('feature-flags');

// ── Constants ─────────────────────────────────────────────────────────────────

const REDIS_PREFIX = 'ff:wolf:';
const REDIS_TTL_SEC = 86_400; // 24h — flags persist across restarts
const FLAG_CACHE_TTL_MS = 30_000; // 30s local cache — avoids Redis on every request
const INVALIDATION_CHANNEL = 'wolf:ff:invalidate'; // pub/sub channel for cross-instance invalidation

// ── Typed flag keys ───────────────────────────────────────────────────────────
// Use FLAGS.CLAUDE_NLU instead of 'claude.nlu' to catch typos at import time.

export const FLAGS = Object.freeze({
  CLAUDE_NLU: 'claude.nlu', // Use Claude for NLU (false → rule-based)
  TTS_ELEVENLABS: 'tts.elevenlabs', // ElevenLabs TTS provider
  TTS_AZURE: 'tts.azure', // Azure TTS provider
  TTS_PIPER: 'tts.piper', // Local Piper TTS provider
  PIPELINE_VOICE: 'pipeline.voice', // Process inbound voice calls
  PIPELINE_SMS: 'pipeline.sms', // Process inbound SMS
  MEMORY_CONTEXT: 'memory.context', // Inject conversation memory into NLU
  RATE_LIMIT: 'rate-limit', // Enforce per-phone rate limit
  AUDIT_LOG: 'audit.log', // Write to audit_logs table
  TRANSLATION: 'translation', // Translate non-FR responses via Claude
});

// ── Default values — ALL enabled unless explicitly disabled ───────────────────

const DEFAULTS = Object.freeze({
  [FLAGS.CLAUDE_NLU]: true,
  [FLAGS.TTS_ELEVENLABS]: true,
  [FLAGS.TTS_AZURE]: true,
  [FLAGS.TTS_PIPER]: true,
  [FLAGS.PIPELINE_VOICE]: true,
  [FLAGS.PIPELINE_SMS]: true,
  [FLAGS.MEMORY_CONTEXT]: true,
  [FLAGS.RATE_LIMIT]: true,
  [FLAGS.AUDIT_LOG]: true,
  [FLAGS.TRANSLATION]: true,
});

// ── In-process cache ──────────────────────────────────────────────────────────

const _cache = new Map(); // flagName → { value: boolean, expiresAt: number }

function _cacheGet(flagName) {
  const entry = _cache.get(flagName);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.value;
}

function _cacheSet(flagName, value) {
  _cache.set(flagName, { value, expiresAt: Date.now() + FLAG_CACHE_TTL_MS });
}

function _cacheInvalidate(flagName) {
  _cache.delete(flagName);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether a feature flag is enabled.
 * Fast path: returns from in-process cache if fresh (< 30s).
 * Slow path: reads from Redis, caches result.
 * Fallback:  returns the default value on Redis error.
 *
 * @param {string} flagName  — one of the FLAGS.* constants
 * @returns {Promise<boolean>}
 */
export async function isEnabled(flagName) {
  const cached = _cacheGet(flagName);
  if (cached !== null) return cached;

  try {
    const raw = await _redisGet(REDIS_PREFIX + flagName);

    // Key absent → use default (fail open)
    if (raw === null || raw === undefined) {
      const defaultValue = DEFAULTS[flagName] ?? true;
      _cacheSet(flagName, defaultValue);
      return defaultValue;
    }

    // '0' | 'false' → disabled; everything else → enabled
    const value = raw !== '0' && raw !== 'false';
    _cacheSet(flagName, value);
    log.debug({ flagName, value, raw }, 'Feature flag resolved from Redis');
    return value;
  } catch (err) {
    log.warn({ err: err.message, flagName }, 'Feature flag Redis read failed — using default');
    const defaultValue = DEFAULTS[flagName] ?? true;
    // Cache the default briefly so we don't hammer Redis on every call during an outage
    _cacheSet(flagName, defaultValue);
    return defaultValue;
  }
}

/**
 * Enable or disable a feature flag.
 * Writes to Redis (24h TTL) and immediately invalidates the local cache.
 * Takes effect on the next request after the FLAG_CACHE_TTL_MS window.
 *
 * @param {string}  flagName
 * @param {boolean} enabled
 */
export async function setFlag(flagName, enabled) {
  const value = enabled ? '1' : '0';
  await _redisSet(REDIS_PREFIX + flagName, value, REDIS_TTL_SEC);
  _cacheInvalidate(flagName);
  // M1 FIX: publish invalidation so other instances drop their local cache immediately.
  // Other instances subscribe via subscribeToFlagInvalidations() at startup.
  await _redisPublish(INVALIDATION_CHANNEL, flagName);
  log.info({ flagName, enabled }, 'Feature flag updated');
}

/**
 * Disable a flag immediately — convenience wrapper over setFlag(name, false).
 * This is the "kill switch" pattern.
 *
 * @param {string} flagName
 */
export async function killSwitch(flagName) {
  return setFlag(flagName, false);
}

/**
 * Re-enable a previously killed flag.
 *
 * @param {string} flagName
 */
export async function restore(flagName) {
  return setFlag(flagName, true);
}

/**
 * Return the current state of all known flags.
 * Reads each flag from cache/Redis. Used by the admin endpoint.
 *
 * @returns {Promise<Record<string, { enabled: boolean, default: boolean, cached: boolean }>>}
 */
export async function getAllFlags() {
  const result = {};
  for (const [constKey, flagName] of Object.entries(FLAGS)) {
    const cached = _cacheGet(flagName);
    const enabled = cached !== null ? cached : await isEnabled(flagName);
    result[flagName] = {
      key: constKey,
      enabled,
      default: DEFAULTS[flagName] ?? true,
      cached: cached !== null,
    };
  }
  return result;
}

/**
 * Snapshot all flags as a plain object for audit log recording.
 * Always reads from cache — never Redis — to keep audit writes fast.
 * Warm the cache with getAllFlags() at startup if needed.
 *
 * @returns {Record<string, boolean>}
 */
export function snapshotFlags() {
  const snapshot = {};
  for (const flagName of Object.values(FLAGS)) {
    const cached = _cacheGet(flagName);
    snapshot[flagName] = cached !== null ? cached : (DEFAULTS[flagName] ?? true);
  }
  return snapshot;
}

/**
 * Clear all in-process cached flag values.
 * Useful after bulk flag updates to force immediate Redis reads.
 * Also resets the lazy Redis module reference so tests can re-mock it.
 */
export function clearCache() {
  _cache.clear();
  _redisModule = null; // allow re-import (important for test isolation)
  log.debug('Feature flag cache cleared');
}

/**
 * Subscribe to cross-instance feature-flag invalidation messages.
 *
 * M1 FIX: When `setFlag()` is called on any instance, it publishes the
 * flag name to `wolf:ff:invalidate`. All other instances receive the message
 * and immediately drop that flag from their local cache. The next call to
 * `isEnabled()` on any instance will re-read from Redis rather than waiting
 * up to 30 seconds for the local TTL to expire.
 *
 * Uses a dedicated ioredis subscriber connection — ioredis in subscribe mode
 * cannot issue regular commands on the same connection.
 *
 * No-op when Redis is not configured (single-instance dev/test environments).
 *
 * Call once at application startup (server.js).
 */
export async function subscribeToFlagInvalidations() {
  try {
    const { redis: mainRedis } = await _getRedis();
    if (!mainRedis) return; // no Redis — single instance, pub/sub unnecessary

    const { default: Redis } = await import('ioredis');
    const subscriber = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null, // subscribers must reconnect indefinitely
      retryStrategy: times => Math.min(times * 200, 5_000),
      lazyConnect: true,
    });

    await subscriber.connect();
    await subscriber.subscribe(INVALIDATION_CHANNEL);

    subscriber.on('message', (_channel, flagName) => {
      _cacheInvalidate(flagName);
      log.debug({ flagName }, 'Feature flag cache invalidated via pub/sub');
    });

    subscriber.on('error', err =>
      log.warn({ err: err.message }, 'Flag invalidation subscriber error')
    );
    subscriber.on('reconnecting', () => log.warn('Flag invalidation subscriber reconnecting'));

    // When the MAIN Redis connection comes back after a disconnect, flags that were
    // changed during the outage are invisible to the local cache (no pub/sub was
    // received while Redis was down). Force a full cache clear so the next
    // isEnabled() call re-reads the authoritative value from Redis.
    if (mainRedis) {
      mainRedis.on('ready', () => {
        clearCache();
        log.info('Feature flag cache cleared after Redis reconnect');
      });
    }

    log.info('Feature flag invalidation subscriber active');
    return subscriber; // return for graceful shutdown in server.js
  } catch (err) {
    // Non-fatal — fall back to 30s TTL-based invalidation
    log.warn(
      { err: err.message },
      'Could not subscribe to flag invalidations — using TTL fallback'
    );
  }
}
