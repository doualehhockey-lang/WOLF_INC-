// tests/services/circuitBreaker.test.js
// Full coverage of CircuitBreaker state machine, withRetry, and error classes.
// Uses a clock-injection pattern (opts.now) so no fake timers are needed.

import { jest } from '@jest/globals';
import {
  CircuitBreaker, CircuitOpenError, TimeoutError, HttpError,
  withRetry, STATE,
} from '../../src/services/circuitBreaker.js';

// ── Test factory ──────────────────────────────────────────────────────────────

function makeBreaker(overrides = {}) {
  let fakeNow = 1_000_000;
  const cb = new CircuitBreaker('test', {
    failureThreshold:   3,
    errorRateThreshold: 0.5,
    minCalls:           10,
    windowMs:           60_000,
    openDurationMs:     10_000,
    now: () => fakeNow,
    ...overrides,
  });
  const advance = (ms) => { fakeNow += ms; };
  return { cb, advance, getNow: () => fakeNow };
}

const succeed  = async () => 'ok';
const fail     = async () => { throw new Error('boom'); };
const abortFn  = (signal) => new Promise((_, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
});

// ═══════════════════════════════════════════════════════════════════════════════
// Custom error classes
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error classes', () => {
  test('CircuitOpenError has correct name and provider', () => {
    const e = new CircuitOpenError('myProvider');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(CircuitOpenError);
    expect(e.name).toBe('CircuitOpenError');
    expect(e.provider).toBe('myProvider');
    expect(e.message).toContain('myProvider');
  });

  test('TimeoutError has correct name, provider, timeoutMs', () => {
    const e = new TimeoutError('myProvider', 5000);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(TimeoutError);
    expect(e.name).toBe('TimeoutError');
    expect(e.provider).toBe('myProvider');
    expect(e.timeoutMs).toBe(5000);
  });

  test('HttpError has correct name and status', () => {
    const e = new HttpError(422, 'Unprocessable');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(HttpError);
    expect(e.name).toBe('HttpError');
    expect(e.status).toBe(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLOSED → OPEN: consecutive failures
// ═══════════════════════════════════════════════════════════════════════════════

describe('CLOSED → OPEN (consecutive failures)', () => {
  test('opens exactly at failureThreshold consecutive failures', async () => {
    const { cb } = makeBreaker({ failureThreshold: 3 });
    await expect(cb.exec(fail)).rejects.toThrow('boom');
    expect(cb.getState()).toBe(STATE.CLOSED);
    await expect(cb.exec(fail)).rejects.toThrow('boom');
    expect(cb.getState()).toBe(STATE.CLOSED);
    await expect(cb.exec(fail)).rejects.toThrow('boom');
    expect(cb.getState()).toBe(STATE.OPEN);
  });

  test('resets consecutive counter on a success', async () => {
    const { cb } = makeBreaker({ failureThreshold: 3 });
    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();
    await cb.exec(succeed);
    expect(cb._consecutiveFailures).toBe(0);
    expect(cb.getState()).toBe(STATE.CLOSED);
  });

  test('fires onStateChange with OPEN on transition', async () => {
    const onStateChange = jest.fn();
    const { cb } = makeBreaker({ failureThreshold: 2, onStateChange });
    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();
    expect(onStateChange).toHaveBeenCalledWith(STATE.OPEN, 'test');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLOSED → OPEN: sliding-window error rate
// ═══════════════════════════════════════════════════════════════════════════════

describe('CLOSED → OPEN (error rate)', () => {
  test('opens when error rate exceeds threshold at minCalls', async () => {
    // failureThreshold=100 so consecutive check never fires; minCalls=4
    const { cb } = makeBreaker({ failureThreshold: 100, errorRateThreshold: 0.5, minCalls: 4 });
    // 3 fails → rate=100%, but only 3 calls < minCalls=4 → stays CLOSED
    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();
    expect(cb.getState()).toBe(STATE.CLOSED);
    // 1 success → 4 calls, rate=75% > 50% → OPEN
    await cb.exec(succeed);
    expect(cb.getState()).toBe(STATE.OPEN);
  });

  test('stays CLOSED below minCalls even at 100% error rate', async () => {
    const { cb } = makeBreaker({ failureThreshold: 100, errorRateThreshold: 0.5, minCalls: 10 });
    for (let i = 0; i < 9; i++) {
      await expect(cb.exec(fail)).rejects.toThrow();
    }
    expect(cb.getState()).toBe(STATE.CLOSED);
  });

  test('expires old calls out of the sliding window', async () => {
    const { cb, advance } = makeBreaker({
      failureThreshold: 100, errorRateThreshold: 0.5, minCalls: 4, windowMs: 5_000,
    });
    for (let i = 0; i < 4; i++) await expect(cb.exec(fail)).rejects.toThrow();
    expect(cb.getState()).toBe(STATE.OPEN);

    cb.reset();
    advance(6_000); // push time past windowMs; old calls expire on next record
    for (let i = 0; i < 3; i++) await expect(cb.exec(fail)).rejects.toThrow();
    // Only 3 fresh calls in window — below minCalls=4
    expect(cb.getState()).toBe(STATE.CLOSED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN state
// ═══════════════════════════════════════════════════════════════════════════════

describe('OPEN state', () => {
  test('rejects with CircuitOpenError while openUntil has not elapsed', async () => {
    const { cb } = makeBreaker({ failureThreshold: 1 });
    await expect(cb.exec(fail)).rejects.toThrow();
    expect(cb.getState()).toBe(STATE.OPEN);
    await expect(cb.exec(succeed)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  test('CircuitOpenError is NOT recorded as a breaker failure', async () => {
    const { cb } = makeBreaker({ failureThreshold: 1 });
    await expect(cb.exec(fail)).rejects.toThrow();
    const prevFailures = cb._consecutiveFailures;
    await expect(cb.exec(succeed)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(cb._consecutiveFailures).toBe(prevFailures);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN → HALF_OPEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('OPEN → HALF_OPEN transition', () => {
  test('transitions to HALF_OPEN after openDurationMs and runs probe', async () => {
    const { cb, advance } = makeBreaker({ failureThreshold: 1, openDurationMs: 5_000 });
    await expect(cb.exec(fail)).rejects.toThrow();
    expect(cb.getState()).toBe(STATE.OPEN);

    advance(5_001);
    // On next exec, timer expired → transition to HALF_OPEN → probe succeeds → CLOSED
    await expect(cb.exec(succeed)).resolves.toBe('ok');
    expect(cb.getState()).toBe(STATE.CLOSED);
  });

  test('fires onStateChange to HALF_OPEN then CLOSED', async () => {
    const onStateChange = jest.fn();
    const { cb, advance } = makeBreaker({ failureThreshold: 1, openDurationMs: 5_000, onStateChange });
    await expect(cb.exec(fail)).rejects.toThrow();
    advance(5_001);
    await cb.exec(succeed);
    const states = onStateChange.mock.calls.map(c => c[0]);
    expect(states).toContain(STATE.HALF_OPEN);
    expect(states).toContain(STATE.CLOSED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HALF_OPEN → CLOSED (probe success)
// ═══════════════════════════════════════════════════════════════════════════════

describe('HALF_OPEN → CLOSED', () => {
  test('closes on successful probe and resets counters', async () => {
    const { cb, advance } = makeBreaker({ failureThreshold: 1, openDurationMs: 5_000 });
    await expect(cb.exec(fail)).rejects.toThrow();
    advance(5_001);

    const result = await cb.exec(succeed);
    expect(result).toBe('ok');
    expect(cb.getState()).toBe(STATE.CLOSED);
    expect(cb._consecutiveFailures).toBe(0);
    expect(cb._halfOpenProbeInFlight).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HALF_OPEN → OPEN (probe failure)
// ═══════════════════════════════════════════════════════════════════════════════

describe('HALF_OPEN → OPEN (probe failure)', () => {
  test('re-opens and resets the timer on probe failure', async () => {
    const { cb, advance } = makeBreaker({ failureThreshold: 1, openDurationMs: 5_000 });
    await expect(cb.exec(fail)).rejects.toThrow();
    advance(5_001);

    // Probe fails → back to OPEN
    await expect(cb.exec(fail)).rejects.toThrow('boom');
    expect(cb.getState()).toBe(STATE.OPEN);
    expect(cb._halfOpenProbeInFlight).toBe(false);

    // Timer was reset — still blocked
    await expect(cb.exec(succeed)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  test('re-opens the timer for another full openDurationMs', async () => {
    const { cb, advance } = makeBreaker({ failureThreshold: 1, openDurationMs: 5_000 });
    await expect(cb.exec(fail)).rejects.toThrow();
    advance(5_001); // first open expires
    await expect(cb.exec(fail)).rejects.toThrow(); // probe fails, timer reset

    // Partial advance (not enough for new timer)
    advance(3_000);
    await expect(cb.exec(succeed)).rejects.toBeInstanceOf(CircuitOpenError);

    // Full advance past new timer
    advance(2_001);
    await expect(cb.exec(succeed)).resolves.toBe('ok');
    expect(cb.getState()).toBe(STATE.CLOSED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HALF_OPEN: concurrent probes
// ═══════════════════════════════════════════════════════════════════════════════

describe('HALF_OPEN: concurrent probe protection', () => {
  test('second concurrent exec throws CircuitOpenError while probe is in-flight', async () => {
    const { cb, advance } = makeBreaker({ failureThreshold: 1, openDurationMs: 5_000 });
    await expect(cb.exec(fail)).rejects.toThrow();
    advance(5_001);

    let resolveProbe;
    const slowFn = () => new Promise(r => { resolveProbe = r; });

    const probe1 = cb.exec(slowFn);   // starts probe, sets _halfOpenProbeInFlight=true
    const probe2 = cb.exec(succeed);  // should be blocked

    await expect(probe2).rejects.toBeInstanceOf(CircuitOpenError);

    resolveProbe('done');
    await expect(probe1).resolves.toBe('done');
    expect(cb.getState()).toBe(STATE.CLOSED);
  });

  test('_halfOpenProbeInFlight resets to false after probe resolves', async () => {
    const { cb, advance } = makeBreaker({ failureThreshold: 1, openDurationMs: 5_000 });
    await expect(cb.exec(fail)).rejects.toThrow();
    advance(5_001);
    await cb.exec(succeed);
    expect(cb._halfOpenProbeInFlight).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// reset()
// ═══════════════════════════════════════════════════════════════════════════════

describe('reset()', () => {
  test('returns to CLOSED and clears all internal state', async () => {
    const { cb } = makeBreaker({ failureThreshold: 1 });
    await expect(cb.exec(fail)).rejects.toThrow();
    expect(cb.getState()).toBe(STATE.OPEN);

    cb.reset();
    expect(cb.getState()).toBe(STATE.CLOSED);
    expect(cb._consecutiveFailures).toBe(0);
    expect(cb._calls).toHaveLength(0);
    expect(cb._openUntil).toBe(0);
    expect(cb._halfOpenProbeInFlight).toBe(false);
  });

  test('fires onStateChange when resetting from OPEN', async () => {
    const onStateChange = jest.fn();
    const { cb } = makeBreaker({ failureThreshold: 1, onStateChange });
    await expect(cb.exec(fail)).rejects.toThrow();
    onStateChange.mockClear();
    cb.reset();
    expect(onStateChange).toHaveBeenCalledWith(STATE.CLOSED, 'test');
  });

  test('does NOT fire onStateChange when already CLOSED', () => {
    const onStateChange = jest.fn();
    const { cb } = makeBreaker({ onStateChange });
    cb.reset(); // no-op
    expect(onStateChange).not.toHaveBeenCalled();
  });

  test('allows exec to succeed after reset from OPEN', async () => {
    const { cb } = makeBreaker({ failureThreshold: 1 });
    await expect(cb.exec(fail)).rejects.toThrow();
    cb.reset();
    await expect(cb.exec(succeed)).resolves.toBe('ok');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Timeout
// ═══════════════════════════════════════════════════════════════════════════════

describe('Timeout', () => {
  test('throws TimeoutError when fn hangs past timeoutMs', async () => {
    const { cb } = makeBreaker({ failureThreshold: 5 });
    await expect(cb.exec(abortFn, { timeoutMs: 20 })).rejects.toBeInstanceOf(TimeoutError);
  });

  test('TimeoutError carries provider and timeoutMs', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 5 });
    const err = await cb.exec(abortFn, { timeoutMs: 20 }).catch(e => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err.provider).toBe('svc');
    expect(err.timeoutMs).toBe(20);
  });

  test('timeout is recorded as a consecutive failure', async () => {
    const { cb } = makeBreaker({ failureThreshold: 5 });
    await expect(cb.exec(abortFn, { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    expect(cb._consecutiveFailures).toBe(1);
  });

  test('repeated timeouts open the circuit', async () => {
    const { cb } = makeBreaker({ failureThreshold: 3 });
    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(abortFn, { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
    }
    expect(cb.getState()).toBe(STATE.OPEN);
  });

  test('fn that resolves quickly does not trigger timeout', async () => {
    const { cb } = makeBreaker({ failureThreshold: 3 });
    const fast = async () => 'fast';
    await expect(cb.exec(fast, { timeoutMs: 2_000 })).resolves.toBe('fast');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// withRetry
// ═══════════════════════════════════════════════════════════════════════════════

describe('withRetry', () => {
  test('returns result immediately on first success', async () => {
    const fn = jest.fn().mockResolvedValue('value');
    const result = await withRetry(fn, { maxRetries: 3, baseMs: 1, maxMs: 5 });
    expect(result).toBe('value');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error then succeeds', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      if (++calls < 3) throw new Error('transient');
      return 'recovered';
    });
    const result = await withRetry(fn, { maxRetries: 3, baseMs: 1, maxMs: 5 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws after exhausting maxRetries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent'));
    await expect(withRetry(fn, { maxRetries: 2, baseMs: 1, maxMs: 5 }))
      .rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test('does NOT retry on CircuitOpenError', async () => {
    const fn = jest.fn().mockRejectedValue(new CircuitOpenError('test'));
    await expect(withRetry(fn, { maxRetries: 3, baseMs: 1, maxMs: 5 }))
      .rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('does NOT retry on 4xx HttpError', async () => {
    const fn = jest.fn().mockRejectedValue(new HttpError(422, 'Unprocessable'));
    await expect(withRetry(fn, { maxRetries: 3, baseMs: 1, maxMs: 5 }))
      .rejects.toBeInstanceOf(HttpError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('does NOT retry on any 4xx (400, 401, 403, 404, 429)', async () => {
    for (const status of [400, 401, 403, 404, 429]) {
      const fn = jest.fn().mockRejectedValue(new HttpError(status, `HTTP ${status}`));
      await expect(withRetry(fn, { maxRetries: 3, baseMs: 1, maxMs: 5 })).rejects.toBeInstanceOf(HttpError);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  test('DOES retry on 5xx HttpError', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      if (++calls < 3) throw new HttpError(503, 'Service Unavailable');
      return 'ok';
    });
    await expect(withRetry(fn, { maxRetries: 3, baseMs: 1, maxMs: 5 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('DOES retry on generic network errors', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      if (++calls < 2) throw new Error('ECONNRESET');
      return 'ok';
    });
    await expect(withRetry(fn, { maxRetries: 2, baseMs: 1, maxMs: 5 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('respects custom shouldRetry predicate', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('custom'));
    const shouldRetry = jest.fn(() => false);
    await expect(withRetry(fn, { maxRetries: 3, baseMs: 1, maxMs: 5, shouldRetry }))
      .rejects.toThrow('custom');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
  });

  test('passes correct attempt index to shouldRetry', async () => {
    const attempts = [];
    const fn = jest.fn().mockRejectedValue(new Error('x'));
    const shouldRetry = (err, attempt) => { attempts.push(attempt); return attempt < 2; };
    await expect(withRetry(fn, { maxRetries: 5, baseMs: 1, maxMs: 5, shouldRetry }))
      .rejects.toThrow('x');
    expect(attempts).toEqual([0, 1, 2]);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
