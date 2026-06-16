// src/features/voice/rate-limiter.js — Per-phone fixed-window rate limiter.
// Uses atomic Lua script via Redis (no race condition).
// Falls back to in-memory INCR when Redis is unavailable.

<<<<<<< HEAD
import { createHash } from 'crypto';
import { childLogger } from '../../core/logger.js';
import { rateLimitCounter } from '../../core/metrics.js';
import {
  evalScript,
  cacheIncr,
  cacheExpire,
  isRedisAvailable,
} from '../../infra/redis/redisClient.js';
import { isEnabled, FLAGS } from '../../core/featureFlags.js';
import { config } from '../../core/config.js';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const log = childLogger('rate-limiter');

const RATE_LIMIT = 20;
const RATE_WINDOW = 60; // seconds

const __dirname = dirname(fileURLToPath(import.meta.url));
const LUA_PATH = resolve(__dirname, '../../infra/redis/scripts/rateLimit.lua');
=======
import { createHash }                       from 'crypto';
import { childLogger }                      from '../../core/logger.js';
import { rateLimitCounter }                 from '../../core/metrics.js';
import { evalScript, cacheIncr, cacheExpire, redisAvailable } from '../../infra/redis/redisClient.js';
import { isEnabled, FLAGS }                 from '../../core/featureFlags.js';
import { readFile }                         from 'fs/promises';
import { resolve, dirname }                 from 'path';
import { fileURLToPath }                    from 'url';

const log = childLogger('rate-limiter');

const RATE_LIMIT  = 20;
const RATE_WINDOW = 60; // seconds

const __dirname = dirname(fileURLToPath(import.meta.url));
const LUA_PATH  = resolve(__dirname, '../../infra/redis/scripts/rateLimit.lua');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

let _luaScript = null;
async function _getLua() {
  if (!_luaScript) _luaScript = await readFile(LUA_PATH, 'utf8');
  return _luaScript;
}

/**
 * Check whether a phone number has exceeded the rate limit.
 * @param {string|null|undefined} phone  — raw E.164 number (will be hashed)
 * @returns {Promise<boolean>}  true = rate-limited, false = allowed
 */
export async function isRateLimited(phone) {
  if (!phone || phone === 'unknown') return false;
  // Kill switch — bypass rate limiting entirely when flag is off
<<<<<<< HEAD
  if (!(await isEnabled(FLAGS.RATE_LIMIT))) return false;

  const hash = _hashPhone(phone);
  const key = `rl:twilio:${hash}`;

  try {
    if (isRedisAvailable()) {
      const lua = await _getLua();
=======
  if (!await isEnabled(FLAGS.RATE_LIMIT)) return false;

  const hash = _hashPhone(phone);
  const key  = `rl:twilio:${hash}`;

  try {
    if (redisAvailable) {
      const lua    = await _getLua();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      const result = await evalScript(lua, [key], [String(RATE_WINDOW), String(RATE_LIMIT)]);
      // result = [current, allowed]  — 1 = allowed, 0 = blocked
      if (result && result[1] === 0) {
        rateLimitCounter.inc();
        log.warn({ hash, count: result[0] }, 'Rate limit exceeded (Redis)');
        return true;
      }
      return false;
    }

    // Fallback — non-atomic but acceptable for single-process dev
    const count = await cacheIncr(key);
    if (count === 1) await cacheExpire(key, RATE_WINDOW);
    if (count > RATE_LIMIT) {
      rateLimitCounter.inc();
      log.warn({ hash, count }, 'Rate limit exceeded (memory)');
      return true;
    }
    return false;
  } catch (err) {
    log.error({ err: err.message, hash }, 'Rate limiter error — allowing request');
    return false; // fail open
  }
}

<<<<<<< HEAD
/**
 * Salted SHA-256 hash of the phone number, truncated to 12 hex chars.
 * H5 FIX: PHONE_SALT is prepended before the number.
 * Without a salt, the ~10B phone number space is dictionary-reversible in minutes.
 * An attacker with Redis read access cannot reconstruct phone numbers from rl: keys.
 */
function _hashPhone(phone) {
  return createHash('sha256').update(config.PHONE_SALT).update(phone).digest('hex').slice(0, 12);
=======
/** HMAC-SHA256 of the phone number, truncated to 12 hex chars. */
function _hashPhone(phone) {
  return createHash('sha256').update(phone).digest('hex').slice(0, 12);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}
