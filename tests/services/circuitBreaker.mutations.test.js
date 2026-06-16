// tests/services/circuitBreaker.mutations.test.js
// Targeted mutation killers for surviving mutants at:
//   L73-79   constructor defaults (LogicalOperator ?? → &&)
//   L85      _calls initial value (ArrayDeclaration)
//   L113     exec() default opts (ObjectLiteral/StringLiteral)
//   L118     OPEN boundary: now < _openUntil (EqualityOperator)
//   L151     _calls.push success:true (BooleanLiteral)
//   L162-163 _recordSuccess → open via error rate + openUntil in future
//   L189-190 _shouldOpen error rate: boundary, filter, division
//   L195-197 _prune: cutoff boundary, filter, method
//   L234     withRetry: attempt >= maxRetries boundary (EqualityOperator)
//   L235-236 withRetry: jitter range, maxMs cap (ArithmeticOperator)
//   L238     withRetry: attempt++ not attempt-- (UpdateOperator)
//   L244-246 _defaultShouldRetry: status boundaries (EqualityOperator/BooleanLiteral)

import { jest } from '@jest/globals';
import {
<<<<<<< HEAD
  CircuitBreaker,
  CircuitOpenError,
  HttpError,
  withRetry,
  STATE,
=======
  CircuitBreaker, CircuitOpenError, HttpError, withRetry, STATE,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
} from '../../src/services/circuitBreaker.js';

// ── Clock-injectable factory ──────────────────────────────────────────────────

function make(overrides = {}) {
  let t = 1_000_000;
  const cb = new CircuitBreaker('x', {
<<<<<<< HEAD
    failureThreshold: 5,
    errorRateThreshold: 0.5,
    minCalls: 10,
    windowMs: 60_000,
    openDurationMs: 10_000,
    now: () => t,
    ...overrides,
  });
  return {
    cb,
    tick: ms => {
      t += ms;
    },
    now: () => t,
  };
}

const ok = async () => 'ok';
const boom = async () => {
  throw new Error('boom');
};
=======
    failureThreshold:   5,
    errorRateThreshold: 0.5,
    minCalls:           10,
    windowMs:           60_000,
    openDurationMs:     10_000,
    now: () => t,
    ...overrides,
  });
  return { cb, tick: (ms) => { t += ms; }, now: () => t };
}

const ok   = async () => 'ok';
const boom = async () => { throw new Error('boom'); };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

// ═════════════════════════════════════════════════════════════════════════════
// L73-79 Constructor defaults — ?? operator (LogicalOperator survivors)
// Stryker mutates `opts.failureThreshold ?? 5` → `opts.failureThreshold && 5`
// If && were used, passing {failureThreshold: 0} would give 5 instead of 0.
// ═════════════════════════════════════════════════════════════════════════════

describe('Constructor ?? defaults — LogicalOperator killers', () => {
  test('failureThreshold=0 is respected (not replaced by default 5)', () => {
    const cb = new CircuitBreaker('t', { failureThreshold: 0 });
    expect(cb._failureThreshold).toBe(0);
  });

  test('errorRateThreshold=0 is respected (not replaced by default 0.5)', () => {
    const cb = new CircuitBreaker('t', { errorRateThreshold: 0 });
    expect(cb._errorRateThreshold).toBe(0);
  });

  test('minCalls=0 is respected (not replaced by default 10)', () => {
    const cb = new CircuitBreaker('t', { minCalls: 0 });
    expect(cb._minCalls).toBe(0);
  });

  test('windowMs=0 is respected (not replaced by default 60000)', () => {
    const cb = new CircuitBreaker('t', { windowMs: 0 });
    expect(cb._windowMs).toBe(0);
  });

  test('openDurationMs=0 is respected (not replaced by default 60000)', () => {
    const cb = new CircuitBreaker('t', { openDurationMs: 0 });
    expect(cb._openDurationMs).toBe(0);
  });

  test('onStateChange=null stays null when explicitly set', () => {
    const cb = new CircuitBreaker('t', { onStateChange: null });
    expect(cb._onStateChange).toBeNull();
  });

  test('onStateChange callback is stored (not defaulted to null)', () => {
    const spy = jest.fn();
    const cb = new CircuitBreaker('t', { onStateChange: spy });
    expect(cb._onStateChange).toBe(spy);
  });

  test('default now() returns a number close to Date.now()', () => {
    const before = Date.now();
    const cb = new CircuitBreaker('t');
    const result = cb._now();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after + 5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L85 _calls initial value — ArrayDeclaration survivor
// Mutant: this._calls = ["Stryker was here"] instead of []
// ═════════════════════════════════════════════════════════════════════════════

describe('_calls initial value — ArrayDeclaration killer', () => {
  test('_calls starts as empty array', () => {
    const cb = new CircuitBreaker('t');
    expect(cb._calls).toEqual([]);
    expect(cb._calls.length).toBe(0);
  });

  test('_calls contains only recorded call objects after exec', async () => {
    const { cb } = make();
    await cb.exec(ok);
    expect(cb._calls).toHaveLength(1);
    expect(typeof cb._calls[0].ts).toBe('number');
    expect(typeof cb._calls[0].success).toBe('boolean');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L113 exec() default opts — ObjectLiteral / StringLiteral survivors
// Mutant: exec(fn, {}) is { requestId: "Stryker was here!" } or {}
// ═════════════════════════════════════════════════════════════════════════════

describe('exec() default opts — ObjectLiteral killer', () => {
  test('exec with no opts argument works correctly', async () => {
    const { cb } = make();
    // Call exec without second argument → uses default `= {}`
    const result = await cb.exec(ok);
    expect(result).toBe('ok');
    expect(cb.getState()).toBe(STATE.CLOSED);
  });

  test('exec with empty opts {} works correctly', async () => {
    const { cb } = make();
    const result = await cb.exec(ok, {});
    expect(result).toBe('ok');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L118 OPEN boundary: now < _openUntil vs now <= _openUntil
// EqualityOperator mutant: changes < to <= so that now === _openUntil still throws.
// The real code uses <: when now === _openUntil the condition is FALSE → transitions.
// ═════════════════════════════════════════════════════════════════════════════

describe('OPEN timer boundary: now < _openUntil (EqualityOperator killer)', () => {
  test('throws CircuitOpenError when now is 1ms before openUntil', async () => {
    const { cb, tick } = make({ failureThreshold: 3, openDurationMs: 10_000 });
    for (let i = 0; i < 3; i++) await cb.exec(boom).catch(() => {});
    expect(cb.getState()).toBe(STATE.OPEN);

    tick(9_999); // 1ms before openUntil → still OPEN
    await expect(cb.exec(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  test('transitions to HALF_OPEN when now === openUntil (boundary: < not <=)', async () => {
    const { cb, tick } = make({ failureThreshold: 3, openDurationMs: 10_000 });
    for (let i = 0; i < 3; i++) await cb.exec(boom).catch(() => {});

    // now < _openUntil is false when now === _openUntil → should transition
    tick(10_000); // now === _openUntil exactly
    await cb.exec(ok); // should NOT throw — transitions to HALF_OPEN then CLOSED
    expect(cb.getState()).toBe(STATE.CLOSED);
  });

  test('transitions to HALF_OPEN when now > openUntil', async () => {
    const { cb, tick } = make({ failureThreshold: 3, openDurationMs: 10_000 });
    for (let i = 0; i < 3; i++) await cb.exec(boom).catch(() => {});

    tick(10_001);
    await cb.exec(ok);
    expect(cb.getState()).toBe(STATE.CLOSED);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L151 _calls.push success:true — BooleanLiteral survivor
// Mutant: success: false in _recordSuccess → success rate would be wrong.
// ═════════════════════════════════════════════════════════════════════════════

describe('_calls.push success:true — BooleanLiteral killer', () => {
  test('successful exec records success:true in _calls', async () => {
    const { cb } = make();
    await cb.exec(ok);
    expect(cb._calls[cb._calls.length - 1].success).toBe(true);
  });

  test('failed exec records success:false in _calls', async () => {
    const { cb } = make();
    await cb.exec(boom).catch(() => {});
    expect(cb._calls[cb._calls.length - 1].success).toBe(false);
  });

  test('mixed calls: error rate reflects actual success flags', async () => {
    const { cb } = make({ minCalls: 4, errorRateThreshold: 0.5, failureThreshold: 100 });
    // 2 success + 2 fail = 50% error rate — exactly at threshold, should NOT open (> not >=)
    await cb.exec(ok);
    await cb.exec(ok);
    await cb.exec(boom).catch(() => {});
    await cb.exec(boom).catch(() => {});
    // 50% = threshold → not open
    expect(cb.getState()).toBe(STATE.CLOSED);

    // 1 more failure → 3/5 = 60% > 50% → opens
    await cb.exec(boom).catch(() => {});
    expect(cb.getState()).toBe(STATE.OPEN);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L162-163 _recordSuccess can open circuit + openUntil is in the future
// ConditionalExpression: `this._state === STATE.CLOSED && this._shouldOpen()`
// ArithmeticOperator: `this._now() + this._openDurationMs` (not -)
// ═════════════════════════════════════════════════════════════════════════════

describe('_recordSuccess → opens circuit via error rate (L162-163 killers)', () => {
  test('success call triggers open when error rate exceeds threshold', async () => {
    const { cb } = make({
      failureThreshold: 100, // won't open via consecutive
      minCalls: 4,
      errorRateThreshold: 0.5,
      openDurationMs: 10_000,
    });

    // 3 failures, then a success = 75% error rate > 50%
    for (let i = 0; i < 3; i++) await cb.exec(boom).catch(() => {});
    await cb.exec(ok); // triggers _recordSuccess which calls _shouldOpen
    expect(cb.getState()).toBe(STATE.OPEN);
  });

  test('openUntil is in the future after opening via _recordSuccess', async () => {
    const { cb, now } = make({
      failureThreshold: 100,
      minCalls: 4,
      errorRateThreshold: 0.5,
      openDurationMs: 10_000,
    });

    for (let i = 0; i < 3; i++) await cb.exec(boom).catch(() => {});
    const beforeOpen = now();
    await cb.exec(ok);

    // openUntil must be NOW + openDurationMs, not NOW - openDurationMs
    expect(cb._openUntil).toBeGreaterThan(beforeOpen);
    expect(cb._openUntil).toBe(beforeOpen + 10_000);
  });

  test('circuit does not open on success when error rate is below threshold', async () => {
    const { cb } = make({
      failureThreshold: 100,
      minCalls: 10,
      errorRateThreshold: 0.5,
    });

    // 4 success, 1 fail = 20% error rate → should NOT open
    for (let i = 0; i < 4; i++) await cb.exec(ok);
    await cb.exec(boom).catch(() => {});
    await cb.exec(ok); // triggers _recordSuccess _shouldOpen check

    expect(cb.getState()).toBe(STATE.CLOSED);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L189-190 _shouldOpen error rate calculation — boundary + method survivors
// MethodExpression: this._calls.filter(c => !c.success)
// EqualityOperator: failures / total > threshold vs >= threshold
// ArithmeticOperator: failures / total vs failures * total
// ═════════════════════════════════════════════════════════════════════════════

describe('_shouldOpen error rate boundary (L189-190 killers)', () => {
  test('error rate exactly at threshold does NOT open (> not >=)', async () => {
    // 5/10 = exactly 0.5 → should NOT open (> 0.5 is false)
    const { cb } = make({
      failureThreshold: 100,
      minCalls: 10,
      errorRateThreshold: 0.5,
    });

    for (let i = 0; i < 5; i++) await cb.exec(boom).catch(() => {});
    for (let i = 0; i < 5; i++) await cb.exec(ok);

    expect(cb.getState()).toBe(STATE.CLOSED);
  });

  test('error rate 1 above threshold opens (6/10 = 0.6 > 0.5)', async () => {
    const { cb } = make({
      failureThreshold: 100,
      minCalls: 10,
      errorRateThreshold: 0.5,
    });

    for (let i = 0; i < 6; i++) await cb.exec(boom).catch(() => {});
    for (let i = 0; i < 4; i++) await cb.exec(ok);

    expect(cb.getState()).toBe(STATE.OPEN);
  });

  test('filter only counts failures (success:false), not successes', async () => {
    // If filter were removed, failures would equal total → always high rate
    const { cb } = make({
      failureThreshold: 100,
      minCalls: 10,
      errorRateThreshold: 0.5,
    });

    // 10 successes → failure rate = 0 → should NOT open
    for (let i = 0; i < 10; i++) await cb.exec(ok);
    expect(cb.getState()).toBe(STATE.CLOSED);
  });

  test('below minCalls threshold does not evaluate error rate', async () => {
    const { cb } = make({
      failureThreshold: 100,
      minCalls: 10,
      errorRateThreshold: 0.1, // very low threshold — would open if rate is checked
    });

    // Only 9 calls (< minCalls=10) all failures
    for (let i = 0; i < 9; i++) await cb.exec(boom).catch(() => {});
    // _shouldOpen: consecutiveFailures=9 < 100, _calls.length=9 < minCalls=10 → false
    expect(cb.getState()).toBe(STATE.CLOSED);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L195-197 _prune — BlockStatement / MethodExpression / EqualityOperator
// _calls = _calls.filter(c => c.ts > cutoff)
// ═════════════════════════════════════════════════════════════════════════════

describe('_prune sliding window (L195-197 killers)', () => {
  test('calls older than windowMs are pruned', async () => {
<<<<<<< HEAD
    const { cb, tick } = make({
      windowMs: 5_000,
      minCalls: 2,
      errorRateThreshold: 1.1,
      failureThreshold: 100,
    });
=======
    const { cb, tick } = make({ windowMs: 5_000, minCalls: 2, errorRateThreshold: 1.1, failureThreshold: 100 });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    await cb.exec(boom).catch(() => {});
    await cb.exec(boom).catch(() => {});
    expect(cb._calls.length).toBe(2); // 2 calls recorded

    tick(5_001); // advance past windowMs

    // A new call prunes old ones
    await cb.exec(ok);
    // The 2 old failures are pruned — only the fresh success remains
    expect(cb._calls.length).toBe(1);
    expect(cb._calls[0].success).toBe(true);
  });

  test('calls exactly at cutoff boundary are pruned (ts > cutoff, not >=)', async () => {
    const { cb, tick } = make({ windowMs: 5_000, failureThreshold: 100 });

    await cb.exec(ok); // call at t=1_000_000
    tick(5_000); // cutoff = 1_000_000, call.ts = 1_000_000 → 1_000_000 > 1_000_000 is FALSE → pruned

    await cb.exec(ok); // triggers prune
    // Original call at exactly cutoff should be pruned
    const oldCall = cb._calls.find(c => c.ts === 1_000_000);
    expect(oldCall).toBeUndefined();
  });

  test('recent calls within window are kept after prune', async () => {
    const { cb, tick } = make({ windowMs: 5_000, failureThreshold: 100 });

    await cb.exec(ok); // t=1_000_000 (old)
<<<<<<< HEAD
    tick(3_000); // t=1_003_000
    await cb.exec(ok); // t=1_003_000 (recent)
    tick(2_001); // total: 5001ms → cutoff=1_000_000, first call pruned
=======
    tick(3_000);        // t=1_003_000
    await cb.exec(ok); // t=1_003_000 (recent)
    tick(2_001);        // total: 5001ms → cutoff=1_000_000, first call pruned
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    await cb.exec(ok); // triggers prune
    expect(cb._calls.length).toBe(2); // second + third call kept
  });

  test('_prune result is assigned back to _calls (method/assignment survivor)', async () => {
    const { cb, tick } = make({ windowMs: 1_000, failureThreshold: 100 });

    await cb.exec(ok);
    tick(1_001);
    await cb.exec(ok); // triggers prune

    // If _prune didn't reassign _calls, the old call would still be there
    expect(cb._calls.every(c => c.ts > 1_000_000)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L234 withRetry: attempt >= maxRetries boundary (EqualityOperator)
// Mutants: > or < instead of >=
// ═════════════════════════════════════════════════════════════════════════════

describe('withRetry attempt >= maxRetries boundary (L234 killers)', () => {
  test('maxRetries=0: never retries (attempt=0 >= maxRetries=0 → stop)', async () => {
    let calls = 0;
<<<<<<< HEAD
    const fn = async () => {
      calls++;
      throw new Error('fail');
    };
=======
    const fn = async () => { calls++; throw new Error('fail'); };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    await expect(withRetry(fn, { maxRetries: 0, baseMs: 0, maxMs: 0 })).rejects.toThrow('fail');
    expect(calls).toBe(1); // exactly 1 attempt, no retry
  });

  test('maxRetries=1: retries exactly once (2 total calls)', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error('fail'); // would need 3 calls to succeed
      return 'ok';
    };

    // maxRetries=1 → only 1 retry → 2 total calls → should still throw
    await expect(withRetry(fn, { maxRetries: 1, baseMs: 0, maxMs: 0 })).rejects.toThrow('fail');
    expect(calls).toBe(2);
  });

  test('maxRetries=2: succeeds on 3rd attempt', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error('fail');
      return 'success';
    };

    const result = await withRetry(fn, { maxRetries: 2, baseMs: 0, maxMs: 0 });
    expect(result).toBe('success');
    expect(calls).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L235-236 withRetry: backoff delay bounds (ArithmeticOperator killers)
// delay = Math.min(baseMs * 2**attempt + jitter, maxMs)
// jitter = Math.random() * 100
// ═════════════════════════════════════════════════════════════════════════════

describe('withRetry backoff bounds (L235-236 killers)', () => {
  test('delay never exceeds maxMs', async () => {
    const delays = [];
    const originalSetTimeout = globalThis.setTimeout;
    const spy = jest.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0, ...args); // execute immediately
    });

    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls <= 3) throw new Error('fail');
      return 'ok';
    };

    await withRetry(fn, { maxRetries: 3, baseMs: 10_000, maxMs: 500 });

    spy.mockRestore();
    // All delays must be ≤ maxMs (500)
    for (const d of delays) {
      expect(d).toBeLessThanOrEqual(500);
    }
  });

  test('jitter = Math.random() * 100, not / 100 (ArithmeticOperator killer)', async () => {
    // Mock Math.random to return 0.5 → jitter should be 50 (not 0.005)
    const randSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const delays = [];
    const originalSetTimeout = globalThis.setTimeout;
    const stSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0, ...args);
    });

    let calls = 0;
    await withRetry(
<<<<<<< HEAD
      async () => {
        if (calls++ < 1) throw new Error('once');
        return 'ok';
      },
=======
      async () => { if (calls++ < 1) throw new Error('once'); return 'ok'; },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      { maxRetries: 1, baseMs: 0, maxMs: 200 }
    );

    stSpy.mockRestore();
    randSpy.mockRestore();
    // Math.random()=0.5 → jitter = 0.5 * 100 = 50 (with mutant: 0.5 / 100 = 0.005)
    // baseMs=0, attempt=0: delay = min(0 * 1 + 50, 200) = 50
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeCloseTo(50, 0); // kills * → / mutant
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L238 withRetry: attempt++ not attempt-- (UpdateOperator killer)
// If attempt--, the loop would never reach maxRetries and retry forever.
// We test that retries stop at the right count (already covered above,
// but this is the explicit attempt increment check).
// ═════════════════════════════════════════════════════════════════════════════

describe('withRetry attempt increments correctly (L238 UpdateOperator killer)', () => {
  test('attempt passed to shouldRetry increases monotonically', async () => {
    const attempts = [];
<<<<<<< HEAD
    const fn = async () => {
      throw new Error('fail');
    };
=======
    const fn = async () => { throw new Error('fail'); };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const shouldRetry = (err, attempt) => {
      attempts.push(attempt);
      return attempt < 3;
    };

<<<<<<< HEAD
    await expect(
      withRetry(fn, { maxRetries: 5, shouldRetry, baseMs: 0, maxMs: 0 })
    ).rejects.toThrow('fail');
=======
    await expect(withRetry(fn, { maxRetries: 5, shouldRetry, baseMs: 0, maxMs: 0 }))
      .rejects.toThrow('fail');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    // shouldRetry called with 0, 1, 2, 3 — on attempt=3 it returns false → throws
    expect(attempts).toEqual([0, 1, 2, 3]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L244-246 _defaultShouldRetry — EqualityOperator / BooleanLiteral survivors
// Boundaries: status >= 400, status < 500
// ═════════════════════════════════════════════════════════════════════════════

describe('_defaultShouldRetry boundaries (L244-246 killers)', () => {
  // Access via withRetry without shouldRetry override → uses _defaultShouldRetry

  test('HttpError 399 IS retried (< 400, not a 4xx)', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new HttpError(399, 'below 400');
      return 'ok';
    };

    const result = await withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 });
    expect(result).toBe('ok');
    expect(calls).toBe(3); // retried
  });

  test('HttpError 400 is NOT retried (exactly at 4xx boundary)', async () => {
    let calls = 0;
<<<<<<< HEAD
    const fn = async () => {
      calls++;
      throw new HttpError(400, 'bad request');
    };

    await expect(withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 })).rejects.toMatchObject({
      status: 400,
    });
=======
    const fn = async () => { calls++; throw new HttpError(400, 'bad request'); };

    await expect(withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 })).rejects.toMatchObject({ status: 400 });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(calls).toBe(1); // no retry
  });

  test('HttpError 499 is NOT retried (upper 4xx boundary)', async () => {
    let calls = 0;
<<<<<<< HEAD
    const fn = async () => {
      calls++;
      throw new HttpError(499, 'client error');
    };

    await expect(withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 })).rejects.toMatchObject({
      status: 499,
    });
=======
    const fn = async () => { calls++; throw new HttpError(499, 'client error'); };

    await expect(withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 })).rejects.toMatchObject({ status: 499 });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(calls).toBe(1);
  });

  test('HttpError 500 IS retried (>= 500, not a 4xx)', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new HttpError(500, 'server error');
      return 'ok';
    };

    const result = await withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  test('CircuitOpenError is NOT retried', async () => {
    let calls = 0;
<<<<<<< HEAD
    const fn = async () => {
      calls++;
      throw new CircuitOpenError('test');
    };

    await expect(withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 })).rejects.toBeInstanceOf(
      CircuitOpenError
    );
=======
    const fn = async () => { calls++; throw new CircuitOpenError('test'); };

    await expect(withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 })).rejects.toBeInstanceOf(CircuitOpenError);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(calls).toBe(1);
  });

  test('generic Error IS retried', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error('network hiccup');
      return 'recovered';
    };

    const result = await withRetry(fn, { maxRetries: 3, baseMs: 0, maxMs: 0 });
    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  test('shouldRetry returning false on 1st attempt stops immediately', async () => {
    let calls = 0;
<<<<<<< HEAD
    const fn = async () => {
      calls++;
      throw new Error('fail');
    };
=======
    const fn = async () => { calls++; throw new Error('fail'); };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

    await expect(
      withRetry(fn, { maxRetries: 5, shouldRetry: () => false, baseMs: 0, maxMs: 0 })
    ).rejects.toThrow('fail');
    expect(calls).toBe(1);
  });
});
