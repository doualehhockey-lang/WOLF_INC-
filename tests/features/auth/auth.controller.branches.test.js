// tests/features/auth/auth.controller.branches.test.js
// Covers auth.controller.js line 29: const { apiKey } = req.body ?? {}
// — right side when req.body is null or undefined

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  apiKeys: ['key-abc123'],
  config: { JWT_REFRESH_SECRET: 'test-refresh-secret-very-long-32ch' },
}));

const mockIssueTokens = jest.fn();
jest.unstable_mockModule('../../../src/features/auth/token.service.js', () => ({
  issueTokens: mockIssueTokens,
  refreshTokens: jest.fn(),
  verifyAccess: jest.fn(),
}));

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  cacheDel: jest.fn(async () => {}),
}));

const { handleIssue } = await import('../../../src/features/auth/auth.controller.js');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  res.clearCookie = jest.fn(() => res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Line 29: req.body ?? {} — right side when body is null/undefined
// ═════════════════════════════════════════════════════════════════════════════

describe('handleIssue — null/undefined body (line 29 right branch)', () => {
  test('returns 400 when req.body is null (triggers ?? {} right side)', async () => {
    const req = { body: null, ip: '127.0.0.1' }; // null → ?? {} right side
    const res = mockRes();

    await handleIssue(req, res);

    // apiKey = undefined → 400 VALIDATION_ERROR
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
    expect(mockIssueTokens).not.toHaveBeenCalled();
  });

  test('returns 400 when req.body is undefined (triggers ?? {} right side)', async () => {
    const req = { body: undefined, ip: '127.0.0.1' }; // undefined → ?? {} right side
    const res = mockRes();

    await handleIssue(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockIssueTokens).not.toHaveBeenCalled();
  });
});
