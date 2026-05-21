// tests/invariants/circuit-breaker.invariants.test.js
// FSM invariants: state transitions must obey the circuit breaker state machine.
// CLOSED → OPEN (never CLOSED → HALF_OPEN)
// OPEN   → HALF_OPEN (after timer) → CLOSED (on success) or OPEN (on failure)

import { jest } from '@jest/globals';
import { CircuitBreaker, CircuitOpenError, STATE } from '../../src/services/circuitBreaker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBreaker({ failureThreshold = 5, openDurationMs = 1_000, errorRateThreshold = 0.6, minCalls = 10 } = {}) {
  let t = 0;
  const b = new CircuitBreaker('test', {
    failureThreshold,
    errorRateThreshold,
    minCalls,
    windowMs:      60_000,
    openDurationMs,
    now: () => t,
  });
  b._tick = (ms) => { t += ms; };
  return b;
}

async function fail(b) {
  return b.exec(() => { throw new Error('fail'); }).catch(() => {});
}

async function succeed(b) {
  return b.exec(() => Promise.resolve('ok'));
}

const ALL_STATES = new Set([STATE.CLOSED, STATE.OPEN, STATE.HALF_OPEN]);

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT: Initial state is always CLOSED
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT: initial state is CLOSED', () => {
  test('new breaker always starts CLOSED', () => {
    const b = makeBreaker();
    expect(b.getState()).toBe(STATE.CLOSED);
    expect(b.getState()).not.toBe(STATE.OPEN);
    expect(b.getState()).not.toBe(STATE.HALF_OPEN);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT: State is always valid after any sequence of operations
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT: state always in { CLOSED, OPEN, HALF_OPEN }', () => {
  test('state remains valid after 10 failures then 10 successes', async () => {
    const b = makeBreaker();
    for (let i = 0; i < 10; i++) {
      await fail(b);
      expect(ALL_STATES.has(b.getState())).toBe(true);
    }
    b._tick(1_001);
    for (let i = 0; i < 10; i++) {
      await succeed(b).catch(() => {});
      expect(ALL_STATES.has(b.getState())).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT: CLOSED never jumps directly to HALF_OPEN
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT: CLOSED → OPEN (never CLOSED → HALF_OPEN)', () => {
  test('after 5 consecutive failures, state is OPEN — not HALF_OPEN', async () => {
    const b = makeBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 5; i++) await fail(b);
    expect(b.getState()).toBe(STATE.OPEN);
    expect(b.getState()).not.toBe(STATE.HALF_OPEN);
  });

  test('one success in CLOSED does not transition to HALF_OPEN', async () => {
    const b = makeBreaker();
    await succeed(b);
    expect(b.getState()).toBe(STATE.CLOSED);
    expect(b.getState()).not.toBe(STATE.HALF_OPEN);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT: OPEN exec throws CircuitOpenError before timer expires
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT: OPEN always throws CircuitOpenError before timer expires', () => {
  test('exec on OPEN breaker throws CircuitOpenError', async () => {
    const b = makeBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 5; i++) await fail(b);
    expect(b.getState()).toBe(STATE.OPEN);

    for (let i = 0; i < 10; i++) {
      await expect(b.exec(() => Promise.resolve('ok'))).rejects.toBeInstanceOf(CircuitOpenError);
    }
  });

  test('OPEN breaker never silently passes requests through', async () => {
    const b      = makeBreaker({ failureThreshold: 3 });
    const fnSpy  = jest.fn(async () => 'called');

    for (let i = 0; i < 3; i++) await fail(b);
    expect(b.getState()).toBe(STATE.OPEN);

    // Try 5 times — fn must never be called
    for (let i = 0; i < 5; i++) {
      await b.exec(fnSpy).catch(() => {});
    }
    expect(fnSpy).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT: OPEN → HALF_OPEN after timer, then HALF_OPEN → CLOSED on success
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT: FSM recovery path OPEN → HALF_OPEN → CLOSED', () => {
  test('timer expires → probe succeeds → back to CLOSED', async () => {
    const b = makeBreaker({ failureThreshold: 5, openDurationMs: 1_000 });
    for (let i = 0; i < 5; i++) await fail(b);
    expect(b.getState()).toBe(STATE.OPEN);

    b._tick(1_001); // advance past open duration
    await succeed(b); // probe succeeds → CLOSED
    expect(b.getState()).toBe(STATE.CLOSED);
  });

  test('timer expires → probe fails → stays OPEN', async () => {
    const b = makeBreaker({ failureThreshold: 5, openDurationMs: 1_000 });
    for (let i = 0; i < 5; i++) await fail(b);
    b._tick(1_001);

    await fail(b); // probe fails → OPEN again
    expect(b.getState()).toBe(STATE.OPEN);
    expect(b.getState()).not.toBe(STATE.HALF_OPEN);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT: HALF_OPEN allows only one probe at a time
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT: HALF_OPEN allows exactly one concurrent probe', () => {
  test('second exec while probe is in-flight throws CircuitOpenError', async () => {
    const b = makeBreaker({ failureThreshold: 5, openDurationMs: 1_000 });
    for (let i = 0; i < 5; i++) await fail(b);
    b._tick(1_001);

    let resolveProbe;
    const probe = b.exec(() => new Promise(r => { resolveProbe = r; }));

    // Second concurrent call must be rejected
    await expect(b.exec(() => Promise.resolve('ok'))).rejects.toBeInstanceOf(CircuitOpenError);

    resolveProbe('ok');
    await probe;
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVARIANT: reset() always returns to CLOSED and clears all counters
// ═════════════════════════════════════════════════════════════════════════════

describe('INVARIANT: reset() always returns to CLOSED', () => {
  test('reset from OPEN → CLOSED', async () => {
    const b = makeBreaker({ failureThreshold: 3 });
    for (let i = 0; i < 3; i++) await fail(b);
    expect(b.getState()).toBe(STATE.OPEN);
    b.reset();
    expect(b.getState()).toBe(STATE.CLOSED);
  });

  test('after reset, consecutive failure counter is cleared', async () => {
    const b = makeBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) await fail(b); // 4 of 5
    b.reset();
    for (let i = 0; i < 4; i++) await fail(b); // 4 more — should not open
    expect(b.getState()).toBe(STATE.CLOSED);
  });
});
