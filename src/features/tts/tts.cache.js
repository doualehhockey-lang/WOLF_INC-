// src/features/tts/tts.cache.js — Two-tier TTS buffer cache.
// Tier 1: Redis (persistent, 24h TTL, LRU via EXPIRE refresh).
// Tier 2: In-memory LRU Map (FIFO eviction, max 100 entries).
// Both tiers store { buffer, ext, mimeType }.

import { createHash } from 'crypto';
import { redis, redisAvailable } from '../../infra/redis/redisClient.js';
import { ttsCacheHits } from '../../core/metrics.js';
import { childLogger } from '../../core/logger.js';

const log = childLogger('tts:cache');
const REDIS_TTL = 86_400; // 24 h
const MEM_MAX = 100;

const _mem = new Map();

/** Stable content-addressed key. */
export function cacheKey(text, provider, locale = 'fr-FR') {
  return `tts:${provider}:${locale}:${createHash('md5').update(text).digest('hex')}`;
}

/**
 * @param {string} text
 * @param {string} provider
 * @param {string} [locale]
 * @returns {Promise<{buffer:Buffer,ext:string,mimeType:string}|null>}
 */
export async function cacheGet(text, provider, locale = 'fr-FR') {
  const key = cacheKey(text, provider, locale);

  if (redisAvailable) {
    try {
      const raw = await redis.getBuffer(key);
      if (raw) {
        await redis.expire(key, REDIS_TTL); // LRU refresh
        const metaRaw = await redis.get(`${key}:meta`).catch(() => null);
        const { ext, mimeType } = metaRaw
          ? JSON.parse(metaRaw)
          : { ext: '.wav', mimeType: 'audio/wav' };
        ttsCacheHits.inc({ type: 'redis' });
        return { buffer: raw, ext, mimeType };
      }
    } catch (err) {
      log.warn({ err: err.message }, 'Redis TTS cache read failed');
    }
    return null;
  }

  const cached = _mem.get(key);
  if (cached) {
    ttsCacheHits.inc({ type: 'memory' });
    return cached;
  }
  return null;
}

/**
 * @param {string} text
 * @param {string} provider
 * @param {{buffer:Buffer,ext:string,mimeType:string}} result
 * @param {string} [locale]
 */
export async function cacheSet(text, provider, result, locale = 'fr-FR') {
  const key = cacheKey(text, provider, locale);

  if (redisAvailable) {
    await redis
      .setex(key, REDIS_TTL, result.buffer)
      .catch(err => log.warn({ err: err.message }, 'Redis TTS cache write failed'));
    await redis
      .setex(
        `${key}:meta`,
        REDIS_TTL,
        JSON.stringify({ ext: result.ext, mimeType: result.mimeType })
      )
      .catch(() => {});
    return;
  }

  // In-memory FIFO eviction
  if (_mem.size >= MEM_MAX) _mem.delete(_mem.keys().next().value);
  _mem.set(key, result);
}
