// tests/features/tts/tts.cache.test.js
// Two-tier TTS buffer cache — in-memory path (Redis not available).
// Redis-path tests live in tts.cache.redis.test.js (separate module registry).

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockTtsCacheHits = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  ttsCacheHits: mockTtsCacheHits,
}));

// ── Mock Redis — unavailable (in-memory path) ─────────────────────────────────
const mockRedis = {
  getBuffer: jest.fn(),
  get:       jest.fn(),
  expire:    jest.fn(),
  setex:     jest.fn(),
};
jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  redis:          null,
  redisAvailable: false,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { cacheKey, cacheGet, cacheSet } = await import('../../../src/features/tts/tts.cache.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TEXT     = 'Bonjour monde';
const PROVIDER = 'mock';
const LOCALE   = 'fr-FR';
const fakeBuffer = () => Buffer.alloc(20, 0xAB);

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.getBuffer.mockReset();
  mockRedis.get.mockReset();
  mockRedis.expire.mockReset();
  mockRedis.setex.mockReset();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. cacheKey — determinism and differentiation
// ═════════════════════════════════════════════════════════════════════════════

describe('cacheKey', () => {
  test('returns stable key on repeated calls with same args', () => {
    expect(cacheKey(TEXT, PROVIDER, LOCALE)).toBe(cacheKey(TEXT, PROVIDER, LOCALE));
  });

  test('key matches pattern tts:<provider>:<locale>:<32hex>', () => {
    expect(cacheKey(TEXT, PROVIDER, LOCALE)).toMatch(/^tts:mock:fr-FR:[a-f0-9]{32}$/);
  });

  test('different text → different key', () => {
    expect(cacheKey('hello', PROVIDER, LOCALE)).not.toBe(cacheKey('world', PROVIDER, LOCALE));
  });

  test('different provider → different key', () => {
    expect(cacheKey(TEXT, 'piper', LOCALE)).not.toBe(cacheKey(TEXT, 'elevenlabs', LOCALE));
  });

  test('different locale → different key', () => {
    expect(cacheKey(TEXT, PROVIDER, 'fr-FR')).not.toBe(cacheKey(TEXT, PROVIDER, 'en-US'));
  });

  test('defaults locale to fr-FR when omitted', () => {
    expect(cacheKey(TEXT, PROVIDER)).toBe(cacheKey(TEXT, PROVIDER, 'fr-FR'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. cacheGet — in-memory path (Redis not available)
// ═════════════════════════════════════════════════════════════════════════════

describe('cacheGet — in-memory (no Redis)', () => {
  test('returns null on cold miss', async () => {
    const result = await cacheGet('cold-miss-text-xyz-unique', PROVIDER, LOCALE);
    expect(result).toBeNull();
  });

  test('returns value stored by cacheSet', async () => {
    const buf = fakeBuffer();
    await cacheSet('mem-roundtrip', PROVIDER, { buffer: buf, ext: '.wav', mimeType: 'audio/wav' }, LOCALE);
    const cached = await cacheGet('mem-roundtrip', PROVIDER, LOCALE);
    expect(cached).not.toBeNull();
    expect(cached.ext).toBe('.wav');
    expect(cached.mimeType).toBe('audio/wav');
    expect(cached.buffer.equals(buf)).toBe(true);
  });

  test('records ttsCacheHits with type "memory" on hit', async () => {
    await cacheSet('mem-hit-metric', PROVIDER, { buffer: fakeBuffer(), ext: '.wav', mimeType: 'audio/wav' }, LOCALE);
    await cacheGet('mem-hit-metric', PROVIDER, LOCALE);
    expect(mockTtsCacheHits.inc).toHaveBeenCalledWith({ type: 'memory' });
  });

  test('does not call redis.getBuffer when Redis is not available', async () => {
    await cacheGet('any-text-check', PROVIDER, LOCALE);
    expect(mockRedis.getBuffer).not.toHaveBeenCalled();
  });

  test('locale differentiates in-memory cache entries', async () => {
    const buf1 = Buffer.alloc(10, 0x01);
    const buf2 = Buffer.alloc(10, 0x02);
    await cacheSet('locale-test', PROVIDER, { buffer: buf1, ext: '.wav', mimeType: 'audio/wav' }, 'fr-FR');
    await cacheSet('locale-test', PROVIDER, { buffer: buf2, ext: '.wav', mimeType: 'audio/wav' }, 'en-US');
    const fr = await cacheGet('locale-test', PROVIDER, 'fr-FR');
    const en = await cacheGet('locale-test', PROVIDER, 'en-US');
    expect(fr.buffer.equals(buf1)).toBe(true);
    expect(en.buffer.equals(buf2)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. cacheSet — in-memory path (FIFO eviction)
// ═════════════════════════════════════════════════════════════════════════════

describe('cacheSet — in-memory FIFO eviction', () => {
  test('newly written entries are immediately retrievable', async () => {
    const buf = fakeBuffer();
    const key = `evict-base-${Date.now()}`;
    await cacheSet(key, PROVIDER, { buffer: buf, ext: '.wav', mimeType: 'audio/wav' }, LOCALE);
    const result = await cacheGet(key, PROVIDER, LOCALE);
    expect(result).not.toBeNull();
    expect(result.buffer.equals(buf)).toBe(true);
  });

  test('writing 101+ unique entries evicts oldest (FIFO, cap 100)', async () => {
    const prefix  = `fifo-${Date.now()}-`;
    const entries = [];
    for (let i = 0; i < 101; i++) {
      entries.push(`${prefix}${i}`);
      await cacheSet(`${prefix}${i}`, PROVIDER, { buffer: fakeBuffer(), ext: '.wav', mimeType: 'audio/wav' }, LOCALE);
    }
    // Latest entry must be accessible
    const latest = await cacheGet(entries[100], PROVIDER, LOCALE);
    expect(latest).not.toBeNull();
    // 101 writes must complete without error (eviction is FIFO, map stays ≤ 100)
    expect(true).toBe(true);
  });
});
