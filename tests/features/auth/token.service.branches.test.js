// tests/features/auth/token.service.branches.test.js
// Covers token.service.js line 66: if (!payload.jti) throw new Error('Missing refresh token id')

import { jest } from '@jest/globals';
<<<<<<< HEAD
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-access-secret-padding-1234567890';
=======
import jwt      from 'jsonwebtoken';

const JWT_SECRET         = 'test-access-secret-padding-1234567890';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
const JWT_REFRESH_SECRET = 'test-refresh-secret-padding-1234567890';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    JWT_SECRET,
    JWT_REFRESH_SECRET,
  },
  apiKeys: ['test-api-key-abc'],
}));

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
<<<<<<< HEAD
  cacheSet: jest.fn(async () => {}),
  cacheGet: jest.fn(async () => '1'), // return truthy — token not revoked
  cacheDel: jest.fn(async () => {}),
  cacheIncr: jest.fn(async () => 1),
  cacheExpire: jest.fn(async () => {}),
  cacheTtl: jest.fn(async () => -1),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  evalScript: jest.fn(async () => null),
=======
  cacheSet:    jest.fn(async () => {}),
  cacheGet:    jest.fn(async () => '1'),  // return truthy — token not revoked
  cacheDel:    jest.fn(async () => {}),
  cacheIncr:   jest.fn(async () => 1),
  cacheExpire: jest.fn(async () => {}),
  cacheTtl:    jest.fn(async () => -1),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

const { refreshTokens } = await import('../../../src/features/auth/token.service.js');

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 66: if (!payload.jti) throw new Error('Missing refresh token id')
// ═════════════════════════════════════════════════════════════════════════════

describe('refreshTokens — missing jti (line 66)', () => {
  test('throws when refresh token has no jti field', async () => {
    // Sign a refresh token WITHOUT a jti field (only sub)
    const noJtiToken = jwt.sign({ sub: 'user-no-jti' }, JWT_REFRESH_SECRET, {
      expiresIn: '7d',
      algorithm: 'HS256',
    });

    await expect(refreshTokens(noJtiToken)).rejects.toThrow('Missing refresh token id');
  });
});
