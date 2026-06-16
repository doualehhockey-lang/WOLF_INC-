// tests/features/tts/tts.cache.defaults.test.js
// Covers tts.cache.js lines 28, 60: locale = 'fr-FR' default parameter branches.
// Existing tests always pass locale explicitly. This file calls without locale.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockTtsCacheHits = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  ttsCacheHits: mockTtsCacheHits,
<<<<<<< HEAD
  auditLogFailures: { inc: jest.fn() },
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// Redis not available — exercises in-memory path without locale arg
jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
<<<<<<< HEAD
  redis: null,
=======
  redis:          null,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  redisAvailable: false,
}));

const { cacheKey, cacheGet, cacheSet } = await import('../../../src/features/tts/tts.cache.js');

<<<<<<< HEAD
const TEXT = 'Bonjour par défaut';
const PROVIDER = 'mock';
const result = { buffer: Buffer.alloc(20, 0xab), ext: '.wav', mimeType: 'audio/wav' };
=======
const TEXT     = 'Bonjour par défaut';
const PROVIDER = 'mock';
const result   = { buffer: Buffer.alloc(20, 0xAB), ext: '.wav', mimeType: 'audio/wav' };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 28: cacheGet locale = 'fr-FR' default parameter
// ═════════════════════════════════════════════════════════════════════════════

describe('cacheGet — locale default parameter (line 28)', () => {
  test('uses "fr-FR" as default locale when not provided', async () => {
    // Prime the cache using cacheKey with explicit locale
    const key = cacheKey(TEXT, PROVIDER, 'fr-FR');
    await cacheSet(TEXT, PROVIDER, result, 'fr-FR');

    // Call without locale — should use 'fr-FR' default and find the cached entry
    const found = await cacheGet(TEXT, PROVIDER); // no locale arg
    expect(found).not.toBeNull();
    expect(found?.ext).toBe('.wav');
  });

  test('returns null when cache miss with default locale', async () => {
    const miss = await cacheGet('not cached text', PROVIDER); // no locale arg
    expect(miss).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 60: cacheSet locale = 'fr-FR' default parameter
// ═════════════════════════════════════════════════════════════════════════════

describe('cacheSet — locale default parameter (line 60)', () => {
  test('stores with "fr-FR" key when locale not provided', async () => {
    // Set without locale
    await cacheSet(TEXT + '-set', PROVIDER, result); // no locale arg

    // Retrieve with explicit 'fr-FR' locale — should find the entry
    const found = await cacheGet(TEXT + '-set', PROVIDER, 'fr-FR');
    expect(found).not.toBeNull();
    expect(found?.buffer).toEqual(result.buffer);
  });
});
