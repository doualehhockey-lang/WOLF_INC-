// @ts-nocheck
// src/features/tts/tts.cache.js — TTS result caching with Redis + 100-entry FIFO memory fallback.
import { createHash } from 'crypto';
import { cacheGetBuffer, cacheSetBuffer, cacheGet, cacheSet } from '../../infra/redis/client.js';
import { ttsCacheHits } from '../../core/metrics.js';

const MEM_CACHE_MAX = 100;
const _memCache = new Map();

export function cacheKey(provider, locale, text) {
  const hash = createHash('md5').update(text.trim().toLowerCase()).digest('hex');
  return `tts:${provider}:${locale.toLowerCase()}:${hash}`;
}

export async function getCached(key) {
  const bufKey = key;
  const metaKey = `${key}:meta`;

  const buf = await cacheGetBuffer(bufKey).catch(() => null);
  if (buf) {
    const raw = await cacheGet(metaKey).catch(() => null);
    const { ext, mimeType } = raw ? JSON.parse(raw) : { ext: '.wav', mimeType: 'audio/wav' };
    ttsCacheHits.inc({ type: 'redis' });
    return { buffer: buf, ext, mimeType };
  }

  const mem = _memCache.get(key);
  if (mem) {
    ttsCacheHits.inc({ type: 'memory' });
    return mem;
  }

  return null;
}

export async function setCached(key, buffer, ext, mimeType) {
  const metaKey = `${key}:meta`;
  const TTL = 86400;

  await cacheSetBuffer(key, buffer, TTL).catch(() => {});
  await cacheSet(metaKey, JSON.stringify({ ext, mimeType }), TTL).catch(() => {});

  if (_memCache.size >= MEM_CACHE_MAX) {
    _memCache.delete(_memCache.keys().next().value);
  }
  _memCache.set(key, { buffer, ext, mimeType });
}
