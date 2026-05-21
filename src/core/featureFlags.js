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

async function _redisGet(key) {
  try {
    if (!_redisModule) _redisModule = await import('../infra/redis/redisClient.js');
    return _redisModule.cacheGet?.(key) ?? null;
  } catch {
    return null; // Redis module failed to load — fall back to defaults
  }
}

async function _redisSet(key, value, ttl) {
  try {
    if (!_redisModule) _redisModule = await import('../infra/redis/redisClient.js');
    return _redisModule.cacheSet?.(key, value, ttl);
  } catch { /* ignore — flag will expire from local cache */ }
}

const log = childLogger('feature-flags');

// ── Constants ─────────────────────────────────────────────────────────────────

const REDIS_PREFIX      = 'ff:wolf:';
const REDIS_TTL_SEC     = 86_400;       // 24h — flags persist across restarts
const FLAG_CACHE_TTL_MS = 30_000;       // 30s local cache — avoids Redis on every request

// ── Typed flag keys ───────────────────────────────────────────────────────────
// Use FLAGS.CLAUDE_NLU instead of 'claude.nlu' to catch typos at import time.

export const FLAGS = Object.freeze({
  CLAUDE_NLU:       'claude.nlu',       // Use Claude for NLU (false → rule-based)
  OLLAMA_NLU:       'ollama.nlu',       // Use Ollama when Claude is killed
  TTS_ELEVENLABS:   'tts.elevenlabs',   // ElevenLabs TTS provider
  TTS_AZURE:        'tts.azure',        // Azure TTS provider
  TTS_PIPER:        'tts.piper',        // Local Piper TTS provider
  PIPELINE_VOICE:   'pipeline.voice',   // Process inbound voice calls
  PIPELINE_SMS:     'pipeline.sms',     // Process inbound SMS
  MEMORY_CONTEXT:   'memory.context',   // Inject conversation memory into NLU
  RATE_LIMIT:       'rate-limit',       // Enforce per-phone rate limit
  OTEL_TRACES:      'otel.traces',      // Emit OpenTelemetry traces
  AUDIT_LOG:        'audit.log',        // Write to audit_logs table
  TRANSLATION:      'translation',      // Translate non-FR responses via Claude
});

// ── Default values — ALL enabled unless explicitly disabled ───────────────────

const DEFAULTS = Object.freeze({
  [FLAGS.CLAUDE_NLU]:     true,
  [FLAGS.OLLAMA_NLU]:     true,
  [FLAGS.TTS_ELEVENLABS]: true,
  [FLAGS.TTS_AZURE]:      true,
  [FLAGS.TTS_PIPER]:      true,
  [FLAGS.PIPELINE_VOICE]: true,
  [FLAGS.PIPELINE_SMS]:   true,
  [FLAGS.MEMORY_CONTEXT]: true,
  [FLAGS.RATE_LIMIT]:     true,
  [FLAGS.OTEL_TRACES]:    true,
  [FLAGS.AUDIT_LOG]:      true,
  [FLAGS.TRANSLATION]:    true,
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
      key:     constKey,
      enabled,
      default: DEFAULTS[flagName] ?? true,
      cached:  cached !== null,
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
