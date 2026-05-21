// tests/core/logger.dev.test.js
// Covers logger.js line 32: the pino-pretty transport branch (isDev = true).
// All other test files mock logger.js, so the real module is rarely imported.
// This file imports logger.js directly in a non-production environment to
// exercise the isDev ? pino.transport({ target: 'pino-pretty', ... }) : undefined branch.

import { jest } from '@jest/globals';

// Ensure NODE_ENV is not 'production' so isDev = true → pino-pretty branch taken
const originalNodeEnv = process.env.NODE_ENV;
delete process.env.NODE_ENV; // undefined → isDev = true

// ── Import the REAL logger (no mock) ─────────────────────────────────────────

const { logger, childLogger } = await import('../../src/core/logger.js');

afterAll(() => {
  if (originalNodeEnv !== undefined) {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// pino-pretty branch — line 32
// ═════════════════════════════════════════════════════════════════════════════

describe('logger — dev mode (pino-pretty branch, line 32)', () => {
  test('logger is created successfully in dev mode', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  test('childLogger returns a child logger instance', () => {
    const child = childLogger('test-module');
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  test('logger does not throw when logging in dev mode', () => {
    expect(() => {
      logger.info({ test: 'value' }, 'test log message');
    }).not.toThrow();
  });

  test('child logger does not throw when logging', () => {
    const child = childLogger('test');
    expect(() => {
      child.debug({ action: 'test' }, 'debug message');
    }).not.toThrow();
  });
});
