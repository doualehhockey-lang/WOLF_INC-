// tests/services/circuitBreaker.defaults.test.js
// Covers circuitBreaker.js remaining branch gaps:
//   Line 71:      constructor(name, opts = {}) — default opts parameter
//   Line 190:     errorRateThreshold TRUE branch — error rate triggers open
//   Lines 221-223: withRetry(fn, opts = {}) — default opts + maxRetries/baseMs/maxMs defaults

import { jest } from '@jest/globals';

const { CircuitBreaker, withRetry, HttpError } =
  await import('../../src/services/circuitBreaker.js');

// ═════════════════════════════════════════════════════════════════════════════
// Line 71: constructor opts = {} default
// ═════════════════════════════════════════════════════════════════════════════

describe('CircuitBreaker constructor — default opts (line 71)', () => {
  test('creates breaker with default settings when no opts passed', () => {
    // Call with only name — triggers opts = {} default parameter
    const breaker = new CircuitBreaker('defaults-test');
    expect(breaker.getState()).toBe('CLOSED');
    // Verify defaults are applied
    expect(breaker._failureThreshold).toBe(5);
    expect(breaker._errorRateThreshold).toBe(0.5);
    expect(breaker._minCalls).toBe(10);
    expect(breaker._windowMs).toBe(60_000);
    expect(breaker._openDurationMs).toBe(60_000);
    expect(breaker._onStateChange).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 190: error rate threshold triggers OPEN (errorRateThreshold branch)
// ═════════════════════════════════════════════════════════════════════════════

describe('CircuitBreaker — error rate triggers open (line 190)', () => {
  test('opens via error rate when failures/total exceeds threshold after minCalls', async () => {
    let fakeNow = 0;
    const breaker = new CircuitBreaker('rate-test', {
      failureThreshold:   100,       // high → won't open via consecutive failures
      errorRateThreshold: 0.5,       // 50% error rate
      minCalls:           4,         // open after 4 calls if rate > 50%
      windowMs:           60_000,
      openDurationMs:     60_000,
      now: () => fakeNow,
    });

    // 3 failures + 1 success = 75% error rate (> 50%) after 4 calls
    const fail = () => breaker.exec(async () => { throw new Error('boom'); }).catch(() => {});
    const succeed = () => breaker.exec(async () => 'ok');

    await fail();
    await fail();
    await fail();
    // After 3 failures, _consecutiveFailures = 3, still < failureThreshold=100
    // After 4th call (success): rate = 3/4 = 75% > 50% → should trigger line 190 true branch
    // But success triggers _recordSuccess which calls _shouldOpen
    await succeed();

    // The circuit should now be OPEN due to error rate
    expect(breaker.getState()).toBe('OPEN');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 221-223: withRetry defaults
// ═════════════════════════════════════════════════════════════════════════════

describe('withRetry — default parameter branches (lines 221-223)', () => {
  test('uses default maxRetries=3 when opts is omitted', async () => {
    // Call withRetry(fn) without opts → opts = {} default taken
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 4) throw new Error('retry-needed');
      return 'success';
    };

    // withRetry without opts → default maxRetries=3 → 4 total attempts
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(attempts).toBe(4); // 1 initial + 3 retries
  });

  test('uses default shouldRetry when not provided in opts', async () => {
    // HttpError 4xx should NOT be retried (default shouldRetry behavior)
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new HttpError(400, 'Bad Request');
    };

    await expect(withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 })).rejects.toThrow('Bad Request');
    // Should only be called once — 4xx is not retryable
    expect(calls).toBe(1);
  });

  test('succeeds immediately when fn resolves on first call with default opts', async () => {
    // withRetry(fn) with no opts → all defaults applied, no delay since fn succeeds first try
    const result = await withRetry(async () => 'immediate');
    expect(result).toBe('immediate');
  });
});
