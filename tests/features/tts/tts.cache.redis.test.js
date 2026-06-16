// tests/features/tts/tts.cache.redis.test.js
// TTS buffer cache — Redis path (redisAvailable: true, separate module registry).
// In-memory path tests live in tts.cache.test.js.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockTtsCacheHits = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  ttsCacheHits: mockTtsCacheHits,
  auditLogFailures: { inc: jest.fn() },
}));

// ── Mock Redis — always available ─────────────────────────────────────────────
const mockRedis = {
  getBuffer: jest.fn(),
  get: jest.fn(),
  expire: jest.fn(),
  setex: jest.fn(),
};
jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  redis: mockRedis,
  redisAvailable: true,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { cacheKey, cacheGet, cacheSet } = await import('../../../src/features/tts/tts.cache.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TEXT = 'Bonjour monde Redis';
const PROVIDER = 'mock';
const LOCALE = 'fr-FR';
const fakeBuffer = () => Buffer.alloc(20, 0xab);

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.getBuffer.mockReset();
  mockRedis.get.mockReset();
  mockRedis.expire.mockReset();
  mockRedis.setex.mockReset();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. cacheGet — Redis path
// ═════════════════════════════════════════════════════════════════════════════

describe('cacheGet — Redis available', () => {
  test('calls redis.getBuffer with the computed key', async () => {
    mockRedis.getBuffer.mockResolvedValueOnce(null);
    await cacheGet(TEXT, PROVIDER, LOCALE);
    expect(mockRedis.getBuffer).toHaveBeenCalledWith(cacheKey(TEXT, PROVIDER, LOCALE));
  });

  test('returns buffer + decoded meta on Redis hit', async () => {
    const buf = fakeBuffer();
    mockRedis.getBuffer.mockResolvedValueOnce(buf);
    mockRedis.expire.mockResolvedValueOnce(1);
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ ext: '.mp3', mimeType: 'audio/mpeg' }));
    const result = await cacheGet(TEXT, PROVIDER, LOCALE);
    expect(result.buffer).toBe(buf);
    expect(result.ext).toBe('.mp3');
    expect(result.mimeType).toBe('audio/mpeg');
  });

  test('refreshes TTL via expire() on hit (LRU behaviour)', async () => {
    const buf = fakeBuffer();
    mockRedis.getBuffer.mockResolvedValueOnce(buf);
    mockRedis.expire.mockResolvedValueOnce(1);
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ ext: '.wav', mimeType: 'audio/wav' }));
    await cacheGet(TEXT, PROVIDER, LOCALE);
    expect(mockRedis.expire).toHaveBeenCalledWith(cacheKey(TEXT, PROVIDER, LOCALE), 86400);
  });

  test('records ttsCacheHits with type "redis" on hit', async () => {
    const buf = fakeBuffer();
    mockRedis.getBuffer.mockResolvedValueOnce(buf);
    mockRedis.expire.mockResolvedValueOnce(1);
    mockRedis.get.mockResolvedValueOnce(null);
    await cacheGet(TEXT, PROVIDER, LOCALE);
    expect(mockTtsCacheHits.inc).toHaveBeenCalledWith({ type: 'redis' });
  });

  test('defaults ext/mimeType to audio/wav when meta key errors', async () => {
    const buf = fakeBuffer();
    mockRedis.getBuffer.mockResolvedValueOnce(buf);
    mockRedis.expire.mockResolvedValueOnce(1);
    mockRedis.get.mockRejectedValueOnce(new Error('key gone'));
    const result = await cacheGet(TEXT, PROVIDER, LOCALE);
    expect(result.ext).toBe('.wav');
    expect(result.mimeType).toBe('audio/wav');
  });

  test('returns null on Redis miss (getBuffer returns null)', async () => {
    mockRedis.getBuffer.mockResolvedValueOnce(null);
    const result = await cacheGet(TEXT, PROVIDER, LOCALE);
    expect(result).toBeNull();
  });

  test('returns null and does not throw when Redis throws ECONNRESET', async () => {
    mockRedis.getBuffer.mockRejectedValueOnce(new Error('ECONNRESET'));
    const result = await cacheGet(TEXT, PROVIDER, LOCALE);
    expect(result).toBeNull();
  });

  test('does not increment ttsCacheHits on Redis miss', async () => {
    mockRedis.getBuffer.mockResolvedValueOnce(null);
    await cacheGet(TEXT, PROVIDER, LOCALE);
    expect(mockTtsCacheHits.inc).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. cacheSet — Redis path
// ═════════════════════════════════════════════════════════════════════════════

describe('cacheSet — Redis available', () => {
  test('calls redis.setex for buffer with 24h TTL (86400s)', async () => {
    const buf = fakeBuffer();
    mockRedis.setex.mockResolvedValue('OK');
    await cacheSet(
      'redis-set-test',
      PROVIDER,
      { buffer: buf, ext: '.wav', mimeType: 'audio/wav' },
      LOCALE
    );
    expect(mockRedis.setex).toHaveBeenCalledWith(
      cacheKey('redis-set-test', PROVIDER, LOCALE),
      86400,
      buf
    );
  });

  test('writes ext and mimeType in :meta key', async () => {
    const buf = fakeBuffer();
    mockRedis.setex.mockResolvedValue('OK');
    await cacheSet(
      'redis-meta-test',
      PROVIDER,
      { buffer: buf, ext: '.mp3', mimeType: 'audio/mpeg' },
      LOCALE
    );
    const metaKey = `${cacheKey('redis-meta-test', PROVIDER, LOCALE)}:meta`;
    const metaCall = mockRedis.setex.mock.calls.find(([k]) => k === metaKey);
    expect(metaCall).toBeDefined();
    const parsed = JSON.parse(metaCall[2]);
    expect(parsed.ext).toBe('.mp3');
    expect(parsed.mimeType).toBe('audio/mpeg');
  });

  test('silently ignores Redis buffer write failure (does not throw)', async () => {
    mockRedis.setex.mockRejectedValue(new Error('OOM command not allowed'));
    const buf = fakeBuffer();
    await expect(
      cacheSet(
        'redis-err-test',
        PROVIDER,
        { buffer: buf, ext: '.wav', mimeType: 'audio/wav' },
        LOCALE
      )
    ).resolves.toBeUndefined();
  });
});
