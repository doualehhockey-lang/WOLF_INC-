// @ts-nocheck
// src/services/circuitBreaker.js — A++ circuit breaker with retry.
//
// State machine: CLOSED ↔ HALF_OPEN ↔ OPEN
// Opens on: consecutive failures >= threshold OR error rate > threshold (min N calls in window).
// withRetry: exponential backoff with jitter, never retries CircuitOpenError or 4xx.

// ── States ────────────────────────────────────────────────────────────────────
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
export const STATE = Object.freeze(stryMutAct_9fa48("0") ? {} : (stryCov_9fa48("0"), {
  CLOSED: stryMutAct_9fa48("1") ? "" : (stryCov_9fa48("1"), 'CLOSED'),
  OPEN: stryMutAct_9fa48("2") ? "" : (stryCov_9fa48("2"), 'OPEN'),
  HALF_OPEN: stryMutAct_9fa48("3") ? "" : (stryCov_9fa48("3"), 'HALF_OPEN')
}));

// ── Custom errors ─────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(provider) {
    if (stryMutAct_9fa48("4")) {
      {}
    } else {
      stryCov_9fa48("4");
      super(stryMutAct_9fa48("5") ? `` : (stryCov_9fa48("5"), `Circuit breaker OPEN for provider "${provider}"`));
      this.name = stryMutAct_9fa48("6") ? "" : (stryCov_9fa48("6"), 'CircuitOpenError');
      this.provider = provider;
    }
  }
}
export class TimeoutError extends Error {
  constructor(provider, timeoutMs) {
    if (stryMutAct_9fa48("7")) {
      {}
    } else {
      stryCov_9fa48("7");
      super(stryMutAct_9fa48("8") ? `` : (stryCov_9fa48("8"), `Request to "${provider}" timed out after ${timeoutMs}ms`));
      this.name = stryMutAct_9fa48("9") ? "" : (stryCov_9fa48("9"), 'TimeoutError');
      this.provider = provider;
      this.timeoutMs = timeoutMs;
    }
  }
}

/** Thrown for HTTP responses with non-2xx status codes. */
export class HttpError extends Error {
  constructor(status, message) {
    if (stryMutAct_9fa48("10")) {
      {}
    } else {
      stryCov_9fa48("10");
      super(message);
      this.name = stryMutAct_9fa48("11") ? "" : (stryCov_9fa48("11"), 'HttpError');
      this.status = status;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _isAbortError(err) {
  if (stryMutAct_9fa48("12")) {
    {}
  } else {
    stryCov_9fa48("12");
    return stryMutAct_9fa48("15") ? err?.name === 'AbortError' &&
    // Stryker disable next-line all -- DOMException global absent in Node < 18 test envs; branch unreachable in CI
    typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError' : stryMutAct_9fa48("14") ? false : stryMutAct_9fa48("13") ? true : (stryCov_9fa48("13", "14", "15"), (stryMutAct_9fa48("17") ? err?.name !== 'AbortError' : stryMutAct_9fa48("16") ? false : (stryCov_9fa48("16", "17"), (stryMutAct_9fa48("18") ? err.name : (stryCov_9fa48("18"), err?.name)) === (stryMutAct_9fa48("19") ? "" : (stryCov_9fa48("19"), 'AbortError')))) ||
    // Stryker disable next-line all -- DOMException global absent in Node < 18 test envs; branch unreachable in CI
    typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError');
  }
}
function _sleep(ms) {
  if (stryMutAct_9fa48("30")) {
    {}
  } else {
    stryCov_9fa48("30");
    return new Promise(resolve => {
      if (stryMutAct_9fa48("31")) {
        {}
      } else {
        stryCov_9fa48("31");
        const t = setTimeout(resolve, ms);
        // Stryker disable next-line OptionalChaining -- t is always a Timeout object in Node.js; optional chaining unreachable
        t?.unref?.();
      }
    });
  }
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
    if (stryMutAct_9fa48("34")) {
      {}
    } else {
      stryCov_9fa48("34");
      this.name = name;
      this._failureThreshold = stryMutAct_9fa48("35") ? opts.failureThreshold && 5 : (stryCov_9fa48("35"), opts.failureThreshold ?? 5);
      this._errorRateThreshold = stryMutAct_9fa48("36") ? opts.errorRateThreshold && 0.5 : (stryCov_9fa48("36"), opts.errorRateThreshold ?? 0.5);
      this._minCalls = stryMutAct_9fa48("37") ? opts.minCalls && 10 : (stryCov_9fa48("37"), opts.minCalls ?? 10);
      this._windowMs = stryMutAct_9fa48("38") ? opts.windowMs && 60_000 : (stryCov_9fa48("38"), opts.windowMs ?? 60_000);
      this._openDurationMs = stryMutAct_9fa48("39") ? opts.openDurationMs && 60_000 : (stryCov_9fa48("39"), opts.openDurationMs ?? 60_000);
      this._onStateChange = stryMutAct_9fa48("40") ? opts.onStateChange && null : (stryCov_9fa48("40"), opts.onStateChange ?? null);
      this._now = stryMutAct_9fa48("41") ? opts.now && (() => Date.now()) : (stryCov_9fa48("41"), opts.now ?? (stryMutAct_9fa48("42") ? () => undefined : (stryCov_9fa48("42"), () => Date.now())));
      this._state = STATE.CLOSED;
      this._consecutiveFailures = 0;
      this._openUntil = 0;
      this._halfOpenProbeInFlight = stryMutAct_9fa48("43") ? true : (stryCov_9fa48("43"), false);
      this._calls = stryMutAct_9fa48("44") ? ["Stryker was here"] : (stryCov_9fa48("44"), []); // { ts: number, success: boolean }[]
    }
  }

  /** Current breaker state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' */
  getState() {
    if (stryMutAct_9fa48("45")) {
      {}
    } else {
      stryCov_9fa48("45");
      return this._state;
    }
  }

  /** Hard-reset to CLOSED, clearing all counters and the sliding window. */
  reset() {
    if (stryMutAct_9fa48("46")) {
      {}
    } else {
      stryCov_9fa48("46");
      const wasOpen = stryMutAct_9fa48("49") ? this._state === STATE.CLOSED : stryMutAct_9fa48("48") ? false : stryMutAct_9fa48("47") ? true : (stryCov_9fa48("47", "48", "49"), this._state !== STATE.CLOSED);
      this._state = STATE.CLOSED;
      this._consecutiveFailures = 0;
      this._openUntil = 0;
      this._halfOpenProbeInFlight = stryMutAct_9fa48("50") ? true : (stryCov_9fa48("50"), false);
      this._calls = stryMutAct_9fa48("51") ? ["Stryker was here"] : (stryCov_9fa48("51"), []);
      if (stryMutAct_9fa48("53") ? false : stryMutAct_9fa48("52") ? true : (stryCov_9fa48("52", "53"), wasOpen)) stryMutAct_9fa48("54") ? this._onStateChange(STATE.CLOSED, this.name) : (stryCov_9fa48("54"), this._onStateChange?.(STATE.CLOSED, this.name));
    }
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
  async exec(fn, {
    requestId = stryMutAct_9fa48("55") ? "Stryker was here!" : (stryCov_9fa48("55"), ''),
    timeoutMs = 10_000
  } = {}) {
    if (stryMutAct_9fa48("56")) {
      {}
    } else {
      stryCov_9fa48("56");
      // eslint-disable-line no-unused-vars
      const now = this._now();

      // ── OPEN: guard ──────────────────────────────────────────────────────────
      if (stryMutAct_9fa48("59") ? this._state !== STATE.OPEN : stryMutAct_9fa48("58") ? false : stryMutAct_9fa48("57") ? true : (stryCov_9fa48("57", "58", "59"), this._state === STATE.OPEN)) {
        if (stryMutAct_9fa48("60")) {
          {}
        } else {
          stryCov_9fa48("60");
          if (stryMutAct_9fa48("64") ? now >= this._openUntil : stryMutAct_9fa48("63") ? now <= this._openUntil : stryMutAct_9fa48("62") ? false : stryMutAct_9fa48("61") ? true : (stryCov_9fa48("61", "62", "63", "64"), now < this._openUntil)) throw new CircuitOpenError(this.name);
          this._transition(STATE.HALF_OPEN);
        }
      }

      // ── HALF_OPEN: allow only one probe at a time ────────────────────────────
      if (stryMutAct_9fa48("67") ? this._state !== STATE.HALF_OPEN : stryMutAct_9fa48("66") ? false : stryMutAct_9fa48("65") ? true : (stryCov_9fa48("65", "66", "67"), this._state === STATE.HALF_OPEN)) {
        if (stryMutAct_9fa48("68")) {
          {}
        } else {
          stryCov_9fa48("68");
          if (stryMutAct_9fa48("70") ? false : stryMutAct_9fa48("69") ? true : (stryCov_9fa48("69", "70"), this._halfOpenProbeInFlight)) throw new CircuitOpenError(this.name);
          this._halfOpenProbeInFlight = stryMutAct_9fa48("71") ? false : (stryCov_9fa48("71"), true);
        }
      }

      // ── Execute with timeout ─────────────────────────────────────────────────
      const ac = new AbortController();
      const timer = setTimeout(stryMutAct_9fa48("72") ? () => undefined : (stryCov_9fa48("72"), () => ac.abort()), timeoutMs);
      try {
        if (stryMutAct_9fa48("73")) {
          {}
        } else {
          stryCov_9fa48("73");
          const result = await fn(ac.signal);
          clearTimeout(timer);
          this._recordSuccess();
          return result;
        }
      } catch (err) {
        if (stryMutAct_9fa48("74")) {
          {}
        } else {
          stryCov_9fa48("74");
          clearTimeout(timer);
          if (stryMutAct_9fa48("76") ? false : stryMutAct_9fa48("75") ? true : (stryCov_9fa48("75", "76"), _isAbortError(err))) {
            if (stryMutAct_9fa48("77")) {
              {}
            } else {
              stryCov_9fa48("77");
              this._recordFailure();
              throw new TimeoutError(this.name, timeoutMs);
            }
          }
          this._recordFailure();
          throw err;
        }
      }
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _recordSuccess() {
    if (stryMutAct_9fa48("78")) {
      {}
    } else {
      stryCov_9fa48("78");
      this._calls.push(stryMutAct_9fa48("79") ? {} : (stryCov_9fa48("79"), {
        ts: this._now(),
        success: stryMutAct_9fa48("80") ? false : (stryCov_9fa48("80"), true)
      }));
      this._prune();
      this._consecutiveFailures = 0;
      if (stryMutAct_9fa48("83") ? this._state !== STATE.HALF_OPEN : stryMutAct_9fa48("82") ? false : stryMutAct_9fa48("81") ? true : (stryCov_9fa48("81", "82", "83"), this._state === STATE.HALF_OPEN)) {
        if (stryMutAct_9fa48("84")) {
          {}
        } else {
          stryCov_9fa48("84");
          this._halfOpenProbeInFlight = stryMutAct_9fa48("85") ? true : (stryCov_9fa48("85"), false);
          this._transition(STATE.CLOSED);
          return;
        }
      }

      // Even a success can trigger open if error rate is too high
      if (stryMutAct_9fa48("88") ? this._state === STATE.CLOSED || this._shouldOpen() : stryMutAct_9fa48("87") ? false : stryMutAct_9fa48("86") ? true : (stryCov_9fa48("86", "87", "88"), (stryMutAct_9fa48("90") ? this._state !== STATE.CLOSED : stryMutAct_9fa48("89") ? true : (stryCov_9fa48("89", "90"), this._state === STATE.CLOSED)) && this._shouldOpen())) {
        if (stryMutAct_9fa48("91")) {
          {}
        } else {
          stryCov_9fa48("91");
          this._openUntil = stryMutAct_9fa48("92") ? this._now() - this._openDurationMs : (stryCov_9fa48("92"), this._now() + this._openDurationMs);
          this._transition(STATE.OPEN);
        }
      }
    }
  }
  _recordFailure() {
    if (stryMutAct_9fa48("93")) {
      {}
    } else {
      stryCov_9fa48("93");
      this._calls.push(stryMutAct_9fa48("94") ? {} : (stryCov_9fa48("94"), {
        ts: this._now(),
        success: stryMutAct_9fa48("95") ? true : (stryCov_9fa48("95"), false)
      }));
      this._prune();
      stryMutAct_9fa48("96") ? this._consecutiveFailures-- : (stryCov_9fa48("96"), this._consecutiveFailures++);
      if (stryMutAct_9fa48("99") ? this._state !== STATE.HALF_OPEN : stryMutAct_9fa48("98") ? false : stryMutAct_9fa48("97") ? true : (stryCov_9fa48("97", "98", "99"), this._state === STATE.HALF_OPEN)) {
        if (stryMutAct_9fa48("100")) {
          {}
        } else {
          stryCov_9fa48("100");
          this._halfOpenProbeInFlight = stryMutAct_9fa48("101") ? true : (stryCov_9fa48("101"), false);
          this._openUntil = stryMutAct_9fa48("102") ? this._now() - this._openDurationMs : (stryCov_9fa48("102"), this._now() + this._openDurationMs);
          this._transition(STATE.OPEN);
          return;
        }
      }
      if (stryMutAct_9fa48("104") ? false : stryMutAct_9fa48("103") ? true : (stryCov_9fa48("103", "104"), this._shouldOpen())) {
        if (stryMutAct_9fa48("105")) {
          {}
        } else {
          stryCov_9fa48("105");
          this._openUntil = stryMutAct_9fa48("106") ? this._now() - this._openDurationMs : (stryCov_9fa48("106"), this._now() + this._openDurationMs);
          this._transition(STATE.OPEN);
        }
      }
    }
  }
  _shouldOpen() {
    if (stryMutAct_9fa48("107")) {
      {}
    } else {
      stryCov_9fa48("107");
      if (stryMutAct_9fa48("111") ? this._consecutiveFailures < this._failureThreshold : stryMutAct_9fa48("110") ? this._consecutiveFailures > this._failureThreshold : stryMutAct_9fa48("109") ? false : stryMutAct_9fa48("108") ? true : (stryCov_9fa48("108", "109", "110", "111"), this._consecutiveFailures >= this._failureThreshold)) return stryMutAct_9fa48("112") ? false : (stryCov_9fa48("112"), true);
      if (stryMutAct_9fa48("116") ? this._calls.length < this._minCalls : stryMutAct_9fa48("115") ? this._calls.length > this._minCalls : stryMutAct_9fa48("114") ? false : stryMutAct_9fa48("113") ? true : (stryCov_9fa48("113", "114", "115", "116"), this._calls.length >= this._minCalls)) {
        if (stryMutAct_9fa48("117")) {
          {}
        } else {
          stryCov_9fa48("117");
          const failures = stryMutAct_9fa48("118") ? this._calls.length : (stryCov_9fa48("118"), this._calls.filter(stryMutAct_9fa48("119") ? () => undefined : (stryCov_9fa48("119"), c => stryMutAct_9fa48("120") ? c.success : (stryCov_9fa48("120"), !c.success))).length);
          if (stryMutAct_9fa48("124") ? failures / this._calls.length <= this._errorRateThreshold : stryMutAct_9fa48("123") ? failures / this._calls.length >= this._errorRateThreshold : stryMutAct_9fa48("122") ? false : stryMutAct_9fa48("121") ? true : (stryCov_9fa48("121", "122", "123", "124"), (stryMutAct_9fa48("125") ? failures * this._calls.length : (stryCov_9fa48("125"), failures / this._calls.length)) > this._errorRateThreshold)) return stryMutAct_9fa48("126") ? false : (stryCov_9fa48("126"), true);
        }
      }
      return stryMutAct_9fa48("127") ? true : (stryCov_9fa48("127"), false);
    }
  }
  _prune() {
    if (stryMutAct_9fa48("128")) {
      {}
    } else {
      stryCov_9fa48("128");
      const cutoff = stryMutAct_9fa48("129") ? this._now() + this._windowMs : (stryCov_9fa48("129"), this._now() - this._windowMs);
      this._calls = stryMutAct_9fa48("130") ? this._calls : (stryCov_9fa48("130"), this._calls.filter(stryMutAct_9fa48("131") ? () => undefined : (stryCov_9fa48("131"), c => stryMutAct_9fa48("135") ? c.ts <= cutoff : stryMutAct_9fa48("134") ? c.ts >= cutoff : stryMutAct_9fa48("133") ? false : stryMutAct_9fa48("132") ? true : (stryCov_9fa48("132", "133", "134", "135"), c.ts > cutoff))));
    }
  }
  _transition(next) {
    if (stryMutAct_9fa48("136")) {
      {}
    } else {
      stryCov_9fa48("136");
      if (stryMutAct_9fa48("139") ? this._state !== next : stryMutAct_9fa48("138") ? false : stryMutAct_9fa48("137") ? true : (stryCov_9fa48("137", "138", "139"), this._state === next)) return;
      this._state = next;
      stryMutAct_9fa48("140") ? this._onStateChange(next, this.name) : (stryCov_9fa48("140"), this._onStateChange?.(next, this.name));
    }
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
  if (stryMutAct_9fa48("141")) {
    {}
  } else {
    stryCov_9fa48("141");
    const {
      maxRetries = 3,
      baseMs = 200,
      maxMs = 2_000,
      shouldRetry = _defaultShouldRetry
    } = opts;
    let attempt = 0;
    if (stryMutAct_9fa48("142")) {
      for (; false;) {
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
    } else {
      stryCov_9fa48("142");
      for (;;) {
        if (stryMutAct_9fa48("143")) {
          {}
        } else {
          stryCov_9fa48("143");
          try {
            if (stryMutAct_9fa48("144")) {
              {}
            } else {
              stryCov_9fa48("144");
              return await fn();
            }
          } catch (err) {
            if (stryMutAct_9fa48("145")) {
              {}
            } else {
              stryCov_9fa48("145");
              if (stryMutAct_9fa48("148") ? attempt >= maxRetries && !shouldRetry(err, attempt) : stryMutAct_9fa48("147") ? false : stryMutAct_9fa48("146") ? true : (stryCov_9fa48("146", "147", "148"), (stryMutAct_9fa48("151") ? attempt < maxRetries : stryMutAct_9fa48("150") ? attempt > maxRetries : stryMutAct_9fa48("149") ? false : (stryCov_9fa48("149", "150", "151"), attempt >= maxRetries)) || (stryMutAct_9fa48("152") ? shouldRetry(err, attempt) : (stryCov_9fa48("152"), !shouldRetry(err, attempt))))) throw err;
              const jitter = stryMutAct_9fa48("153") ? Math.random() / 100 : (stryCov_9fa48("153"), Math.random() * 100);
              const delay = stryMutAct_9fa48("154") ? Math.max(baseMs * 2 ** attempt + jitter, maxMs) : (stryCov_9fa48("154"), Math.min(stryMutAct_9fa48("155") ? baseMs * 2 ** attempt - jitter : (stryCov_9fa48("155"), (stryMutAct_9fa48("156") ? baseMs / 2 ** attempt : (stryCov_9fa48("156"), baseMs * 2 ** attempt)) + jitter), maxMs));
              await _sleep(delay);
              stryMutAct_9fa48("157") ? attempt-- : (stryCov_9fa48("157"), attempt++);
            }
          }
        }
      }
    }
  }
}
function _defaultShouldRetry(err) {
  if (stryMutAct_9fa48("158")) {
    {}
  } else {
    stryCov_9fa48("158");
    if (stryMutAct_9fa48("160") ? false : stryMutAct_9fa48("159") ? true : (stryCov_9fa48("159", "160"), err instanceof CircuitOpenError)) return stryMutAct_9fa48("161") ? true : (stryCov_9fa48("161"), false);
    if (stryMutAct_9fa48("164") ? err instanceof HttpError && err.status >= 400 || err.status < 500 : stryMutAct_9fa48("163") ? false : stryMutAct_9fa48("162") ? true : (stryCov_9fa48("162", "163", "164"), (stryMutAct_9fa48("166") ? err instanceof HttpError || err.status >= 400 : stryMutAct_9fa48("165") ? true : (stryCov_9fa48("165", "166"), err instanceof HttpError && (stryMutAct_9fa48("169") ? err.status < 400 : stryMutAct_9fa48("168") ? err.status > 400 : stryMutAct_9fa48("167") ? true : (stryCov_9fa48("167", "168", "169"), err.status >= 400)))) && (stryMutAct_9fa48("172") ? err.status >= 500 : stryMutAct_9fa48("171") ? err.status <= 500 : stryMutAct_9fa48("170") ? true : (stryCov_9fa48("170", "171", "172"), err.status < 500)))) return stryMutAct_9fa48("173") ? true : (stryCov_9fa48("173"), false);
    return stryMutAct_9fa48("174") ? false : (stryCov_9fa48("174"), true);
  }
}