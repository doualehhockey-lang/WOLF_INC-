// src/services/circuitBreaker.js — A++ circuit breaker with retry.
//
// State machine: CLOSED ↔ HALF_OPEN ↔ OPEN
// Opens on: consecutive failures >= threshold OR error rate > threshold (min N calls in window).
// withRetry: exponential backoff with jitter, never retries CircuitOpenError or 4xx.

// ── States ────────────────────────────────────────────────────────────────────

export const STATE = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

// ── Custom errors ─────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(provider) {
    super(`Circuit breaker OPEN for provider "${provider}"`);
    this.name = 'CircuitOpenError';
    this.provider = provider;
  }
}

export class TimeoutError extends Error {
  constructor(provider, timeoutMs) {
    super(`Request to "${provider}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }
}

/** Thrown for HTTP responses with non-2xx status codes. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    // Stryker disable next-line all -- DOMException global absent in Node < 18 test envs; branch unreachable in CI
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError')
  );
}

function _sleep(ms) {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    // Stryker disable next-line OptionalChaining -- t is always a Timeout object in Node.js; optional chaining unreachable
    t?.unref?.();
  });
}

// ── CircuitBreaker ────────────────────────────────────────────────────────────

export class CircuitBreaker {
  /**
   * @param {string} name Provider name (used in logs/metrics)
   * @param {object} [opts]
   * @param {number}   [opts.failureThreshold=5]      Consecutive failures to open
   * @param {number}   [opts.errorRateThreshold=0.5]  Error rate ratio (0–1) to open
   * @param {number}   [opts.minCalls=10]             Min calls in window for rate check
   * @param {number}   [opts.windowMs=60000]          Sliding window for rate calculation
   * @param {number}   [opts.openDurationMs=60000]    How long to stay OPEN before probing
   * @param {function} [opts.onStateChange]           (newState, name) => void
   * @param {function} [opts.now]                     Clock override — () => number (for tests)
   */
  constructor(name, opts = {}) {
    this.name = name;
    this._failureThreshold = opts.failureThreshold ?? 5;
    this._errorRateThreshold = opts.errorRateThreshold ?? 0.5;
    this._minCalls = opts.minCalls ?? 10;
    this._windowMs = opts.windowMs ?? 60_000;
    this._openDurationMs = opts.openDurationMs ?? 60_000;
    this._onStateChange = opts.onStateChange ?? null;
    this._now = opts.now ?? (() => Date.now());

    this._state = STATE.CLOSED;
    this._consecutiveFailures = 0;
    this._openUntil = 0;
    this._halfOpenProbeInFlight = false;
    this._calls = []; // { ts: number, success: boolean }[]
  }

  /** Current breaker state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' */
  getState() {
    return this._state;
  }

  /** Hard-reset to CLOSED, clearing all counters and the sliding window. */
  reset() {
    const wasOpen = this._state !== STATE.CLOSED;
    this._state = STATE.CLOSED;
    this._consecutiveFailures = 0;
    this._openUntil = 0;
    this._halfOpenProbeInFlight = false;
    this._calls = [];
    if (wasOpen) this._onStateChange?.(STATE.CLOSED, this.name);
  }

  /**
   * Execute fn through the circuit breaker.
   *
   * @param {function(AbortSignal): Promise<*>} fn  Receives an AbortSignal for timeout.
   * @param {object}  [opts]
   * @param {string}  [opts.requestId='']    Passed through to logs.
   * @param {number}  [opts.timeoutMs=10000] Per-call deadline.
   * @returns {Promise<*>}
   * @throws {CircuitOpenError} When the breaker is open and the timer has not expired.
   * @throws {TimeoutError}     When fn does not resolve within timeoutMs.
   */
  async exec(fn, { requestId: _requestId = '', timeoutMs = 10_000 } = {}) {
    const now = this._now();

    // ── OPEN: guard ──────────────────────────────────────────────────────────
    if (this._state === STATE.OPEN) {
      if (now < this._openUntil) throw new CircuitOpenError(this.name);
      this._transition(STATE.HALF_OPEN);
    }

    // ── HALF_OPEN: allow only one probe at a time ────────────────────────────
    if (this._state === STATE.HALF_OPEN) {
      if (this._halfOpenProbeInFlight) throw new CircuitOpenError(this.name);
      this._halfOpenProbeInFlight = true;
    }

    // ── Execute with timeout ─────────────────────────────────────────────────
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const result = await fn(ac.signal);
      clearTimeout(timer);
      this._recordSuccess();
      return result;
    } catch (err) {
      clearTimeout(timer);
      if (_isAbortError(err)) {
        this._recordFailure();
        throw new TimeoutError(this.name, timeoutMs);
      }
      this._recordFailure();
      throw err;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _recordSuccess() {
    this._calls.push({ ts: this._now(), success: true });
    this._prune();
    this._consecutiveFailures = 0;

    if (this._state === STATE.HALF_OPEN) {
      this._halfOpenProbeInFlight = false;
      this._transition(STATE.CLOSED);
      return;
    }

    // Even a success can trigger open if error rate is too high
    // Stryker disable next-line ConditionalExpression -- state is always CLOSED here; HALF_OPEN returns early above
    if (this._state === STATE.CLOSED && this._shouldOpen()) {
      this._openUntil = this._now() + this._openDurationMs;
      this._transition(STATE.OPEN);
    }
  }

  _recordFailure() {
    this._calls.push({ ts: this._now(), success: false });
    this._prune();
    this._consecutiveFailures++;

    if (this._state === STATE.HALF_OPEN) {
      this._halfOpenProbeInFlight = false;
      this._openUntil = this._now() + this._openDurationMs;
      this._transition(STATE.OPEN);
      return;
    }

    if (this._shouldOpen()) {
      this._openUntil = this._now() + this._openDurationMs;
      this._transition(STATE.OPEN);
    }
  }

  _shouldOpen() {
    if (this._consecutiveFailures >= this._failureThreshold) return true;
    if (this._calls.length >= this._minCalls) {
      const failures = this._calls.filter(c => !c.success).length;
      if (failures / this._calls.length > this._errorRateThreshold) return true;
    }
    return false;
  }

  _prune() {
    const cutoff = this._now() - this._windowMs;
    this._calls = this._calls.filter(c => c.ts > cutoff);
  }

  _transition(next) {
    if (this._state === next) return;
    this._state = next;
    this._onStateChange?.(next, this.name);
  }
}

// ── withRetry ─────────────────────────────────────────────────────────────────

/**
 * Execute fn with exponential backoff + jitter retry.
 * Never retries on CircuitOpenError or 4xx HttpError.
 *
 * @param {function(): Promise<*>} fn
 * @param {object}   [opts]
 * @param {number}   [opts.maxRetries=3]     Max additional attempts (total calls = maxRetries+1)
 * @param {number}   [opts.baseMs=200]       Base backoff delay in ms
 * @param {number}   [opts.maxMs=2000]       Max backoff delay in ms
 * @param {function} [opts.shouldRetry]      (err, attempt) => boolean
 * @returns {Promise<*>}
 */
export async function withRetry(fn, opts = {}) {
  const { maxRetries = 3, baseMs = 200, maxMs = 2_000, shouldRetry = _defaultShouldRetry } = opts;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !shouldRetry(err, attempt)) throw err;
      const jitter = Math.random() * 100;
      const delay = Math.min(baseMs * 2 ** attempt + jitter, maxMs);
      await _sleep(delay);
      attempt++;
    }
  }
}

function _defaultShouldRetry(err) {
  if (err instanceof CircuitOpenError) return false;
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) return false;
  return true;
}
