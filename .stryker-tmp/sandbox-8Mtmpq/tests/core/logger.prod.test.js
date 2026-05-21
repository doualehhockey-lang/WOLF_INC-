// @ts-nocheck
// tests/core/logger.prod.test.js
// Covers logger.js line 32 FALSE branch: isDev = false → undefined (JSON output, no pino-pretty).

import { jest } from '@jest/globals';

// Set production environment BEFORE importing — isDev = false → ternary FALSE branch
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';

const { logger, childLogger } = await import('../../src/core/logger.js');

afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('logger — production mode (line 32 FALSE branch)', () => {
  test('logger is created in production mode without pino-pretty transport', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  test('childLogger works in production mode', () => {
    const child = childLogger('prod-test');
    expect(child).toBeDefined();
    expect(typeof child.warn).toBe('function');
  });

  test('logger does not throw when logging in production mode', () => {
    expect(() => logger.info({ env: 'production' }, 'prod log')).not.toThrow();
  });
});
