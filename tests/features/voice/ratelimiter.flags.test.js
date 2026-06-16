// tests/features/voice/ratelimiter.flags.test.js
// Covers: RATE_LIMIT=false kill switch in rate-limiter.js

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/featureFlags.js', () => ({
<<<<<<< HEAD
  isEnabled: jest.fn(async flag => flag !== 'rate-limit'), // default: RATE_LIMIT disabled
  FLAGS: {
    RATE_LIMIT: 'rate-limit',
    PIPELINE_VOICE: 'pipeline.voice',
    PIPELINE_SMS: 'pipeline.sms',
    CLAUDE_NLU: 'claude.nlu',
  },
  setFlag: jest.fn(),
  getAllFlags: jest.fn(),
  snapshotFlags: jest.fn(() => ({})),
  clearCache: jest.fn(),
=======
  isEnabled: jest.fn(async (flag) => flag !== 'rate-limit'), // default: RATE_LIMIT disabled
  FLAGS: {
    RATE_LIMIT: 'rate-limit',
    PIPELINE_VOICE: 'pipeline.voice', PIPELINE_SMS: 'pipeline.sms',
    CLAUDE_NLU: 'claude.nlu',         OLLAMA_NLU:  'ollama.nlu',
  },
  setFlag: jest.fn(), getAllFlags: jest.fn(), snapshotFlags: jest.fn(() => ({})), clearCache: jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  rateLimitCounter: { inc: jest.fn() },
<<<<<<< HEAD
  pipelineLatency: { startTimer: jest.fn(() => jest.fn()) },
  errorCounter: { inc: jest.fn() },
  activeSessions: { set: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
=======
  pipelineLatency:  { startTimer: jest.fn(() => jest.fn()) },
  errorCounter:     { inc: jest.fn() },
  activeSessions:   { set: jest.fn() },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  evalScript: jest.fn(async () => [1, 0]), // would normally rate-limit
<<<<<<< HEAD
  cacheIncr: jest.fn(async () => 999), // counter way above limit
  cacheExpire: jest.fn(),
  cacheGet: jest.fn(async () => null),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheGetBuffer: jest.fn(),
  cacheSetBuffer: jest.fn(),
  cacheTtl: jest.fn(),
  redisAvailable: true,
  isRedisAvailable: jest.fn().mockReturnValue(true),
=======
  cacheIncr:  jest.fn(async () => 999),    // counter way above limit
  cacheExpire: jest.fn(),
  cacheGet:   jest.fn(async () => null),
  cacheSet:   jest.fn(),
  cacheDel:   jest.fn(),
  cacheGetBuffer: jest.fn(),
  cacheSetBuffer: jest.fn(),
  cacheTtl:   jest.fn(),
  redisAvailable: true,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  redis: null,
}));

const { isRateLimited } = await import('../../../src/features/voice/rate-limiter.js');

describe('RATE_LIMIT=false kill switch', () => {
  test('isRateLimited returns false even when Redis would block', async () => {
    // evalScript returns [1,0] meaning "blocked", but RATE_LIMIT flag is off
    const result = await isRateLimited('+15005550001');
    expect(result).toBe(false);
  });

  test('isRateLimited still returns false for unknown phone when flag is off', async () => {
    expect(await isRateLimited('unknown')).toBe(false);
    expect(await isRateLimited(null)).toBe(false);
  });
});
