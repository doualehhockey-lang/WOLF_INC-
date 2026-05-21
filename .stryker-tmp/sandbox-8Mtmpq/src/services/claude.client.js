// @ts-nocheck
// src/services/claude.client.js — Anthropic Claude API client.
// Provides: analyze() for NLU, translate() for multilingual responses.
// Falls back to rule-based NLU when API key is absent or circuit opens.
//
// Circuit breaker: opens after 5 consecutive failures OR >50% error rate in 60s.
// Retry: up to 2 retries with exponential backoff; skips 4xx and CircuitOpenError.
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
import { childLogger } from '../core/logger.js';
import { config } from '../core/config.js';
import { apiFetch } from '../infra/http/httpClient.js';
import { isEnabled, FLAGS } from '../core/featureFlags.js';
import { CircuitBreaker, CircuitOpenError, TimeoutError, HttpError, withRetry, STATE } from './circuitBreaker.js';
import { recordRequest, recordFailure, recordLatency, setCircuitState } from './metrics.js';
const log = childLogger(stryMutAct_9fa48("49") ? "" : (stryCov_9fa48("49"), 'claude'));

// ── Circuit Breaker ───────────────────────────────────────────────────────────

const breaker = new CircuitBreaker(stryMutAct_9fa48("50") ? "" : (stryCov_9fa48("50"), 'claude'), stryMutAct_9fa48("51") ? {} : (stryCov_9fa48("51"), {
  failureThreshold: 5,
  errorRateThreshold: 0.5,
  minCalls: 10,
  windowMs: 60_000,
  openDurationMs: 60_000,
  onStateChange(state, name) {
    if (stryMutAct_9fa48("52")) {
      {}
    } else {
      stryCov_9fa48("52");
      log.warn(stryMutAct_9fa48("53") ? {} : (stryCov_9fa48("53"), {
        provider: name,
        state
      }), stryMutAct_9fa48("54") ? `` : (stryCov_9fa48("54"), `Circuit breaker → ${state}`));
      setCircuitState(name, state);
    }
  }
}));

// Initialise gauge to CLOSED on startup
setCircuitState(stryMutAct_9fa48("55") ? "" : (stryCov_9fa48("55"), 'claude'), STATE.CLOSED);

// ── Helpers ───────────────────────────────────────────────────────────────────

function _escJson(s) {
  if (stryMutAct_9fa48("56")) {
    {}
  } else {
    stryCov_9fa48("56");
    return String(s).replace(/\\/g, stryMutAct_9fa48("57") ? "" : (stryCov_9fa48("57"), '\\\\')).replace(/"/g, stryMutAct_9fa48("58") ? "" : (stryCov_9fa48("58"), '\\"')).replace(/\n/g, stryMutAct_9fa48("59") ? "" : (stryCov_9fa48("59"), '\\n'));
  }
}

/* c8 ignore next 4 — withRetry is mocked in all test suites; _isRetryable is internal and unreachable via the public API in tests */
function _isRetryable(err) {
  if (stryMutAct_9fa48("60")) {
    {}
  } else {
    stryCov_9fa48("60");
    if (stryMutAct_9fa48("62") ? false : stryMutAct_9fa48("61") ? true : (stryCov_9fa48("61", "62"), err instanceof CircuitOpenError)) return stryMutAct_9fa48("63") ? true : (stryCov_9fa48("63"), false);
    if (stryMutAct_9fa48("66") ? err instanceof HttpError && err.status >= 400 || err.status < 500 : stryMutAct_9fa48("65") ? false : stryMutAct_9fa48("64") ? true : (stryCov_9fa48("64", "65", "66"), (stryMutAct_9fa48("68") ? err instanceof HttpError || err.status >= 400 : stryMutAct_9fa48("67") ? true : (stryCov_9fa48("67", "68"), err instanceof HttpError && (stryMutAct_9fa48("71") ? err.status < 400 : stryMutAct_9fa48("70") ? err.status > 400 : stryMutAct_9fa48("69") ? true : (stryCov_9fa48("69", "70", "71"), err.status >= 400)))) && (stryMutAct_9fa48("74") ? err.status >= 500 : stryMutAct_9fa48("73") ? err.status <= 500 : stryMutAct_9fa48("72") ? true : (stryCov_9fa48("72", "73", "74"), err.status < 500)))) return stryMutAct_9fa48("75") ? true : (stryCov_9fa48("75"), false);
    return stryMutAct_9fa48("76") ? false : (stryCov_9fa48("76"), true);
  }
}
function _failureReason(err) {
  if (stryMutAct_9fa48("77")) {
    {}
  } else {
    stryCov_9fa48("77");
    if (stryMutAct_9fa48("79") ? false : stryMutAct_9fa48("78") ? true : (stryCov_9fa48("78", "79"), err instanceof CircuitOpenError)) return stryMutAct_9fa48("80") ? "" : (stryCov_9fa48("80"), 'circuit_open');
    if (stryMutAct_9fa48("82") ? false : stryMutAct_9fa48("81") ? true : (stryCov_9fa48("81", "82"), err instanceof TimeoutError)) return stryMutAct_9fa48("83") ? "" : (stryCov_9fa48("83"), 'timeout');
    if (stryMutAct_9fa48("85") ? false : stryMutAct_9fa48("84") ? true : (stryCov_9fa48("84", "85"), err instanceof HttpError)) return (stryMutAct_9fa48("89") ? err.status < 500 : stryMutAct_9fa48("88") ? err.status > 500 : stryMutAct_9fa48("87") ? false : stryMutAct_9fa48("86") ? true : (stryCov_9fa48("86", "87", "88", "89"), err.status >= 500)) ? stryMutAct_9fa48("90") ? "" : (stryCov_9fa48("90"), 'http_5xx') : stryMutAct_9fa48("91") ? "" : (stryCov_9fa48("91"), 'http_4xx');
    return stryMutAct_9fa48("92") ? "" : (stryCov_9fa48("92"), 'network');
  }
}
function _requestStatus(err) {
  if (stryMutAct_9fa48("93")) {
    {}
  } else {
    stryCov_9fa48("93");
    if (stryMutAct_9fa48("95") ? false : stryMutAct_9fa48("94") ? true : (stryCov_9fa48("94", "95"), err instanceof CircuitOpenError)) return stryMutAct_9fa48("96") ? "" : (stryCov_9fa48("96"), 'circuit_open');
    if (stryMutAct_9fa48("98") ? false : stryMutAct_9fa48("97") ? true : (stryCov_9fa48("97", "98"), err instanceof TimeoutError)) return stryMutAct_9fa48("99") ? "" : (stryCov_9fa48("99"), 'timeout');
    return stryMutAct_9fa48("100") ? "" : (stryCov_9fa48("100"), 'error');
  }
}

// ── Low-level API call ────────────────────────────────────────────────────────

/* c8 ignore next 3 — analyze() always guards CLAUDE_API_KEY before calling _call; this guard is unreachable in practice */
async function _call(body, {
  requestId = stryMutAct_9fa48("101") ? "Stryker was here!" : (stryCov_9fa48("101"), '')
} = {}) {
  if (stryMutAct_9fa48("102")) {
    {}
  } else {
    stryCov_9fa48("102");
    // Stryker disable next-line all -- defense-in-depth guard; analyze() pre-checks CLAUDE_API_KEY so this branch is structurally unreachable in tests
    if (!config.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY not configured');
    const start = Date.now();
    let attempts = 0;
    try {
      if (stryMutAct_9fa48("107")) {
        {}
      } else {
        stryCov_9fa48("107");
        const result = await withRetry(() => {
          if (stryMutAct_9fa48("108")) {
            {}
          } else {
            stryCov_9fa48("108");
            stryMutAct_9fa48("109") ? attempts-- : (stryCov_9fa48("109"), attempts++);
            return breaker.exec(async signal => {
              if (stryMutAct_9fa48("110")) {
                {}
              } else {
                stryCov_9fa48("110");
                const res = await apiFetch(stryMutAct_9fa48("111") ? "" : (stryCov_9fa48("111"), 'https://api.anthropic.com/v1/messages'), stryMutAct_9fa48("112") ? {} : (stryCov_9fa48("112"), {
                  method: stryMutAct_9fa48("113") ? "" : (stryCov_9fa48("113"), 'POST'),
                  headers: stryMutAct_9fa48("114") ? {} : (stryCov_9fa48("114"), {
                    'Content-Type': stryMutAct_9fa48("115") ? "" : (stryCov_9fa48("115"), 'application/json'),
                    'x-api-key': config.CLAUDE_API_KEY,
                    'anthropic-version': stryMutAct_9fa48("116") ? "" : (stryCov_9fa48("116"), '2023-06-01')
                  }),
                  body: JSON.stringify(body),
                  signal
                }));
                if (stryMutAct_9fa48("119") ? false : stryMutAct_9fa48("118") ? true : stryMutAct_9fa48("117") ? res.ok : (stryCov_9fa48("117", "118", "119"), !res.ok)) {
                  if (stryMutAct_9fa48("120")) {
                    {}
                  } else {
                    stryCov_9fa48("120");
                    const detail = await res.text().catch(stryMutAct_9fa48("121") ? () => undefined : (stryCov_9fa48("121"), () => stryMutAct_9fa48("122") ? "Stryker was here!" : (stryCov_9fa48("122"), '')));
                    throw new HttpError(res.status, stryMutAct_9fa48("123") ? `` : (stryCov_9fa48("123"), `Claude ${res.status}: ${stryMutAct_9fa48("124") ? detail : (stryCov_9fa48("124"), detail.slice(0, 200))}`));
                  }
                }
                return res.json();
              }
            }, stryMutAct_9fa48("125") ? {} : (stryCov_9fa48("125"), {
              requestId,
              timeoutMs: 30_000
            }));
          }
        }, stryMutAct_9fa48("126") ? {} : (stryCov_9fa48("126"), {
          maxRetries: 2,
          shouldRetry: _isRetryable
        }));
        const latency = stryMutAct_9fa48("127") ? Date.now() + start : (stryCov_9fa48("127"), Date.now() - start);
        recordRequest(stryMutAct_9fa48("128") ? "" : (stryCov_9fa48("128"), 'claude'), stryMutAct_9fa48("129") ? "" : (stryCov_9fa48("129"), 'success'));
        recordLatency(stryMutAct_9fa48("130") ? "" : (stryCov_9fa48("130"), 'claude'), latency);
        log.debug(stryMutAct_9fa48("131") ? {} : (stryCov_9fa48("131"), {
          requestId,
          latency,
          attempts,
          state: breaker.getState()
        }), stryMutAct_9fa48("132") ? "" : (stryCov_9fa48("132"), 'Claude OK'));
        return result;
      }
    } catch (err) {
      if (stryMutAct_9fa48("133")) {
        {}
      } else {
        stryCov_9fa48("133");
        const latency = stryMutAct_9fa48("134") ? Date.now() + start : (stryCov_9fa48("134"), Date.now() - start);
        recordRequest(stryMutAct_9fa48("135") ? "" : (stryCov_9fa48("135"), 'claude'), _requestStatus(err));
        recordFailure(stryMutAct_9fa48("136") ? "" : (stryCov_9fa48("136"), 'claude'), _failureReason(err));
        recordLatency(stryMutAct_9fa48("137") ? "" : (stryCov_9fa48("137"), 'claude'), latency);
        log.warn(stryMutAct_9fa48("138") ? {} : (stryCov_9fa48("138"), {
          requestId,
          latency,
          attempts,
          state: breaker.getState(),
          err: err.message
        }), stryMutAct_9fa48("139") ? "" : (stryCov_9fa48("139"), 'Claude request failed'));
        throw err;
      }
    }
  }
}

// ── Rule-based fallback (no API key / circuit open) ───────────────────────────

function _ruleBased(text) {
  if (stryMutAct_9fa48("140")) {
    {}
  } else {
    stryCov_9fa48("140");
    const lower = stryMutAct_9fa48("141") ? text.toUpperCase() : (stryCov_9fa48("141"), text.toLowerCase());
    let intent = stryMutAct_9fa48("142") ? "" : (stryCov_9fa48("142"), 'unknown');
    if (stryMutAct_9fa48("144") ? false : stryMutAct_9fa48("143") ? true : (stryCov_9fa48("143", "144"), /cr(ee|ée|éer|eer|e un|ajoute)|planif|book|schedul/.test(lower))) intent = stryMutAct_9fa48("145") ? "" : (stryCov_9fa48("145"), 'create_event');else if (stryMutAct_9fa48("147") ? false : stryMutAct_9fa48("146") ? true : (stryCov_9fa48("146", "147"), /annul|supprim|effac|retir|delet/.test(lower))) intent = stryMutAct_9fa48("148") ? "" : (stryCov_9fa48("148"), 'cancel_event');else if (stryMutAct_9fa48("150") ? false : stryMutAct_9fa48("149") ? true : (stryCov_9fa48("149", "150"), (stryMutAct_9fa48("151") ? /modif|change|d[^eé]place|replan|repouss/ : (stryCov_9fa48("151"), /modif|change|d[eé]place|replan|repouss/)).test(lower))) intent = stryMutAct_9fa48("152") ? "" : (stryCov_9fa48("152"), 'update_event');else if (stryMutAct_9fa48("154") ? false : stryMutAct_9fa48("153") ? true : (stryCov_9fa48("153", "154"), /liste|quels|quoi|affich|show|display/.test(lower))) intent = stryMutAct_9fa48("155") ? "" : (stryCov_9fa48("155"), 'list_events');
    const mTime = lower.match(stryMutAct_9fa48("160") ? /(\d{1,2})[h:](\D{0,2})/ : stryMutAct_9fa48("159") ? /(\d{1,2})[h:](\d)/ : stryMutAct_9fa48("158") ? /(\d{1,2})[^h:](\d{0,2})/ : stryMutAct_9fa48("157") ? /(\D{1,2})[h:](\d{0,2})/ : stryMutAct_9fa48("156") ? /(\d)[h:](\d{0,2})/ : (stryCov_9fa48("156", "157", "158", "159", "160"), /(\d{1,2})[h:](\d{0,2})/));
    const time = mTime ? stryMutAct_9fa48("161") ? `` : (stryCov_9fa48("161"), `${mTime[1]}:${(stryMutAct_9fa48("164") ? mTime[2] && '00' : stryMutAct_9fa48("163") ? false : stryMutAct_9fa48("162") ? true : (stryCov_9fa48("162", "163", "164"), mTime[2] || (stryMutAct_9fa48("165") ? "" : (stryCov_9fa48("165"), '00')))).padStart(2, stryMutAct_9fa48("166") ? "" : (stryCov_9fa48("166"), '0'))}`) : stryMutAct_9fa48("167") ? "Stryker was here!" : (stryCov_9fa48("167"), '');
    const mDate = lower.match(stryMutAct_9fa48("171") ? /(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\D{1,2})/ : stryMutAct_9fa48("170") ? /(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d)/ : stryMutAct_9fa48("169") ? /(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\D{1,2}\/\d{1,2})/ : stryMutAct_9fa48("168") ? /(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d\/\d{1,2})/ : (stryCov_9fa48("168", "169", "170", "171"), /(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d{1,2})/));
    let date = stryMutAct_9fa48("172") ? "Stryker was here!" : (stryCov_9fa48("172"), '');
    if (stryMutAct_9fa48("174") ? false : stryMutAct_9fa48("173") ? true : (stryCov_9fa48("173", "174"), mDate)) {
      if (stryMutAct_9fa48("175")) {
        {}
      } else {
        stryCov_9fa48("175");
        const d = mDate[1];
        const now = new Date();
        if (stryMutAct_9fa48("178") ? d !== "aujourd'hui" : stryMutAct_9fa48("177") ? false : stryMutAct_9fa48("176") ? true : (stryCov_9fa48("176", "177", "178"), d === (stryMutAct_9fa48("179") ? "" : (stryCov_9fa48("179"), "aujourd'hui")))) {
          if (stryMutAct_9fa48("180")) {
            {}
          } else {
            stryCov_9fa48("180");
            date = stryMutAct_9fa48("181") ? now.toISOString() : (stryCov_9fa48("181"), now.toISOString().slice(0, 10));
          }
        } else if (stryMutAct_9fa48("184") ? d !== 'demain' : stryMutAct_9fa48("183") ? false : stryMutAct_9fa48("182") ? true : (stryCov_9fa48("182", "183", "184"), d === (stryMutAct_9fa48("185") ? "" : (stryCov_9fa48("185"), 'demain')))) {
          if (stryMutAct_9fa48("186")) {
            {}
          } else {
            stryCov_9fa48("186");
            const dt = new Date(now);
            stryMutAct_9fa48("187") ? dt.setTime(dt.getDate() + 1) : (stryCov_9fa48("187"), dt.setDate(stryMutAct_9fa48("188") ? dt.getDate() - 1 : (stryCov_9fa48("188"), dt.getDate() + 1)));
            date = stryMutAct_9fa48("189") ? dt.toISOString() : (stryCov_9fa48("189"), dt.toISOString().slice(0, 10));
          }
        } else if (stryMutAct_9fa48("191") ? false : stryMutAct_9fa48("190") ? true : (stryCov_9fa48("190", "191"), (stryMutAct_9fa48("195") ? /\d{1,2}\/\D{1,2}/ : stryMutAct_9fa48("194") ? /\d{1,2}\/\d/ : stryMutAct_9fa48("193") ? /\D{1,2}\/\d{1,2}/ : stryMutAct_9fa48("192") ? /\d\/\d{1,2}/ : (stryCov_9fa48("192", "193", "194", "195"), /\d{1,2}\/\d{1,2}/)).test(d))) {
          if (stryMutAct_9fa48("196")) {
            {}
          } else {
            stryCov_9fa48("196");
            const [day, month] = d.split(stryMutAct_9fa48("197") ? "" : (stryCov_9fa48("197"), '/'));
            date = stryMutAct_9fa48("198") ? new Date(now.getFullYear(), Number(month) - 1, Number(day)).toISOString() : (stryCov_9fa48("198"), new Date(now.getFullYear(), stryMutAct_9fa48("199") ? Number(month) + 1 : (stryCov_9fa48("199"), Number(month) - 1), Number(day)).toISOString().slice(0, 10));
          }
        }
      }
    }
    const mSubject = lower.match(stryMutAct_9fa48("201") ? /(?:pour |avec |concernant )(.+?)(?: à | au | en | le )/ : stryMutAct_9fa48("200") ? /(?:pour |avec |concernant )(.)(?: à | au | en | le |$)/ : (stryCov_9fa48("200", "201"), /(?:pour |avec |concernant )(.+?)(?: à | au | en | le |$)/));
    return stryMutAct_9fa48("202") ? {} : (stryCov_9fa48("202"), {
      intent,
      subject: stryMutAct_9fa48("203") ? mSubject?.[1]?.trim() && '' : (stryCov_9fa48("203"), (stryMutAct_9fa48("206") ? mSubject[1]?.trim() : stryMutAct_9fa48("205") ? mSubject?.[1].trim() : stryMutAct_9fa48("204") ? mSubject?.[1] : (stryCov_9fa48("204", "205", "206"), mSubject?.[1]?.trim())) ?? (stryMutAct_9fa48("207") ? "Stryker was here!" : (stryCov_9fa48("207"), ''))),
      date,
      time,
      confidence: (stryMutAct_9fa48("210") ? intent !== 'unknown' : stryMutAct_9fa48("209") ? false : stryMutAct_9fa48("208") ? true : (stryCov_9fa48("208", "209", "210"), intent === (stryMutAct_9fa48("211") ? "" : (stryCov_9fa48("211"), 'unknown')))) ? 0.25 : 0.85,
      errors: stryMutAct_9fa48("212") ? ["Stryker was here"] : (stryCov_9fa48("212"), []),
      strategy: stryMutAct_9fa48("213") ? "" : (stryCov_9fa48("213"), 'rule-based')
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * NLU analysis — extract intent, date, time, subject from user text.
 * Falls back to rule-based extraction if Claude is unavailable.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.model]
 * @param {number} [opts.temperature]
 * @param {string} [opts.requestId]
 * @returns {Promise<object>}
 */
export async function analyze(text, opts = {}) {
  if (stryMutAct_9fa48("214")) {
    {}
  } else {
    stryCov_9fa48("214");
    if (stryMutAct_9fa48("217") ? false : stryMutAct_9fa48("216") ? true : stryMutAct_9fa48("215") ? text?.trim() : (stryCov_9fa48("215", "216", "217"), !(stryMutAct_9fa48("219") ? text.trim() : stryMutAct_9fa48("218") ? text : (stryCov_9fa48("218", "219"), text?.trim())))) {
      if (stryMutAct_9fa48("220")) {
        {}
      } else {
        stryCov_9fa48("220");
        return stryMutAct_9fa48("221") ? {} : (stryCov_9fa48("221"), {
          intent: stryMutAct_9fa48("222") ? "" : (stryCov_9fa48("222"), 'unknown'),
          subject: stryMutAct_9fa48("223") ? "Stryker was here!" : (stryCov_9fa48("223"), ''),
          date: stryMutAct_9fa48("224") ? "Stryker was here!" : (stryCov_9fa48("224"), ''),
          time: stryMutAct_9fa48("225") ? "Stryker was here!" : (stryCov_9fa48("225"), ''),
          confidence: 0,
          errors: stryMutAct_9fa48("226") ? [] : (stryCov_9fa48("226"), [stryMutAct_9fa48("227") ? "" : (stryCov_9fa48("227"), 'empty-input')]),
          strategy: stryMutAct_9fa48("228") ? "" : (stryCov_9fa48("228"), 'none')
        });
      }
    }
    const claudeEnabled = await isEnabled(FLAGS.CLAUDE_NLU);
    if (stryMutAct_9fa48("231") ? (!config.CLAUDE_API_KEY || breaker.getState() === STATE.OPEN) && !claudeEnabled : stryMutAct_9fa48("230") ? false : stryMutAct_9fa48("229") ? true : (stryCov_9fa48("229", "230", "231"), (stryMutAct_9fa48("233") ? !config.CLAUDE_API_KEY && breaker.getState() === STATE.OPEN : stryMutAct_9fa48("232") ? false : (stryCov_9fa48("232", "233"), (stryMutAct_9fa48("234") ? config.CLAUDE_API_KEY : (stryCov_9fa48("234"), !config.CLAUDE_API_KEY)) || (stryMutAct_9fa48("236") ? breaker.getState() !== STATE.OPEN : stryMutAct_9fa48("235") ? false : (stryCov_9fa48("235", "236"), breaker.getState() === STATE.OPEN)))) || (stryMutAct_9fa48("237") ? claudeEnabled : (stryCov_9fa48("237"), !claudeEnabled)))) {
      if (stryMutAct_9fa48("238")) {
        {}
      } else {
        stryCov_9fa48("238");
        log.debug(stryMutAct_9fa48("239") ? {} : (stryCov_9fa48("239"), {
          requestId: opts.requestId,
          state: breaker.getState(),
          claudeEnabled
        }), stryMutAct_9fa48("240") ? "" : (stryCov_9fa48("240"), 'Claude NLU unavailable — rule-based fallback'));
        return _ruleBased(text);
      }
    }
    const model = stryMutAct_9fa48("241") ? opts.model && config.CLAUDE_MODEL : (stryCov_9fa48("241"), opts.model ?? config.CLAUDE_MODEL);
    const system = (stryMutAct_9fa48("242") ? "" : (stryCov_9fa48("242"), 'Tu es un extracteur NLU. Retourne UNIQUEMENT une ligne JSON valide avec : ')) + (stryMutAct_9fa48("243") ? "" : (stryCov_9fa48("243"), 'intent (create_event|cancel_event|update_event|list_events|unknown), subject (string), ')) + (stryMutAct_9fa48("244") ? "" : (stryCov_9fa48("244"), 'date (ex: "demain", "lundi", "2026-04-10"), time (ex: "14h30", "09:00"), ')) + (stryMutAct_9fa48("245") ? "" : (stryCov_9fa48("245"), 'confidence (number 0-1), errors (array), strategy (string). Rien d\'autre que le JSON.'));
    try {
      if (stryMutAct_9fa48("246")) {
        {}
      } else {
        stryCov_9fa48("246");
        const json = await _call(stryMutAct_9fa48("247") ? {} : (stryCov_9fa48("247"), {
          model,
          max_tokens: 256,
          temperature: stryMutAct_9fa48("248") ? opts.temperature && 0 : (stryCov_9fa48("248"), opts.temperature ?? 0),
          system,
          messages: stryMutAct_9fa48("249") ? [] : (stryCov_9fa48("249"), [stryMutAct_9fa48("250") ? {} : (stryCov_9fa48("250"), {
            role: stryMutAct_9fa48("251") ? "" : (stryCov_9fa48("251"), 'user'),
            content: stryMutAct_9fa48("252") ? `` : (stryCov_9fa48("252"), `Texte à analyser : "${_escJson(text)}"`)
          })])
        }), stryMutAct_9fa48("253") ? {} : (stryCov_9fa48("253"), {
          requestId: opts.requestId
        }));
        const raw = stryMutAct_9fa48("255") ? (json.content?.[0]?.text ?? '').replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim() : stryMutAct_9fa48("254") ? (json.content?.[0]?.text ?? '').trim().replace(/^```json?\n?/i, '').replace(/\n?```$/, '') : (stryCov_9fa48("254", "255"), (stryMutAct_9fa48("256") ? json.content?.[0]?.text && '' : (stryCov_9fa48("256"), (stryMutAct_9fa48("258") ? json.content[0]?.text : stryMutAct_9fa48("257") ? json.content?.[0].text : (stryCov_9fa48("257", "258"), json.content?.[0]?.text)) ?? (stryMutAct_9fa48("259") ? "Stryker was here!" : (stryCov_9fa48("259"), '')))).trim().replace(stryMutAct_9fa48("262") ? /^```json?\n/i : stryMutAct_9fa48("261") ? /^```json\n?/i : stryMutAct_9fa48("260") ? /```json?\n?/i : (stryCov_9fa48("260", "261", "262"), /^```json?\n?/i), stryMutAct_9fa48("263") ? "Stryker was here!" : (stryCov_9fa48("263"), '')).replace(stryMutAct_9fa48("265") ? /\n```$/ : stryMutAct_9fa48("264") ? /\n?```/ : (stryCov_9fa48("264", "265"), /\n?```$/), stryMutAct_9fa48("266") ? "Stryker was here!" : (stryCov_9fa48("266"), '')).trim());
        let parsed;
        try {
          if (stryMutAct_9fa48("267")) {
            {}
          } else {
            stryCov_9fa48("267");
            parsed = JSON.parse(raw.split(stryMutAct_9fa48("268") ? "" : (stryCov_9fa48("268"), '\n'))[0]);
          }
        } catch {
          if (stryMutAct_9fa48("269")) {
            {}
          } else {
            stryCov_9fa48("269");
            log.warn(stryMutAct_9fa48("270") ? {} : (stryCov_9fa48("270"), {
              requestId: opts.requestId,
              raw: stryMutAct_9fa48("271") ? raw : (stryCov_9fa48("271"), raw.slice(0, 200))
            }), stryMutAct_9fa48("272") ? "" : (stryCov_9fa48("272"), 'Claude JSON parse failed — rule-based fallback'));
            return _ruleBased(text);
          }
        }
        return stryMutAct_9fa48("273") ? {} : (stryCov_9fa48("273"), {
          intent: stryMutAct_9fa48("274") ? parsed.intent && 'unknown' : (stryCov_9fa48("274"), parsed.intent ?? (stryMutAct_9fa48("275") ? "" : (stryCov_9fa48("275"), 'unknown'))),
          subject: stryMutAct_9fa48("276") ? parsed.subject && '' : (stryCov_9fa48("276"), parsed.subject ?? (stryMutAct_9fa48("277") ? "Stryker was here!" : (stryCov_9fa48("277"), ''))),
          date: stryMutAct_9fa48("278") ? parsed.date && '' : (stryCov_9fa48("278"), parsed.date ?? (stryMutAct_9fa48("279") ? "Stryker was here!" : (stryCov_9fa48("279"), ''))),
          time: stryMutAct_9fa48("280") ? parsed.time && '' : (stryCov_9fa48("280"), parsed.time ?? (stryMutAct_9fa48("281") ? "Stryker was here!" : (stryCov_9fa48("281"), ''))),
          confidence: (stryMutAct_9fa48("284") ? typeof parsed.confidence !== 'number' : stryMutAct_9fa48("283") ? false : stryMutAct_9fa48("282") ? true : (stryCov_9fa48("282", "283", "284"), typeof parsed.confidence === (stryMutAct_9fa48("285") ? "" : (stryCov_9fa48("285"), 'number')))) ? parsed.confidence : 0.8,
          errors: stryMutAct_9fa48("286") ? parsed.errors && [] : (stryCov_9fa48("286"), parsed.errors ?? (stryMutAct_9fa48("287") ? ["Stryker was here"] : (stryCov_9fa48("287"), []))),
          strategy: stryMutAct_9fa48("288") ? parsed.strategy && 'claude' : (stryCov_9fa48("288"), parsed.strategy ?? (stryMutAct_9fa48("289") ? "" : (stryCov_9fa48("289"), 'claude')))
        });
      }
    } catch (err) {
      if (stryMutAct_9fa48("290")) {
        {}
      } else {
        stryCov_9fa48("290");
        log.warn(stryMutAct_9fa48("291") ? {} : (stryCov_9fa48("291"), {
          requestId: opts.requestId,
          err: err.message
        }), stryMutAct_9fa48("292") ? "" : (stryCov_9fa48("292"), 'Claude analyze failed — rule-based fallback'));
        return _ruleBased(text);
      }
    }
  }
}

/**
 * Translate text to the target language.
 * Returns original text on failure or missing API key.
 *
 * @param {string} text
 * @param {string} [targetLang='fr']
 * @param {object} [opts]
 * @param {string} [opts.requestId]
 * @returns {Promise<string>}
 */
export async function translate(text, targetLang = stryMutAct_9fa48("293") ? "" : (stryCov_9fa48("293"), 'fr'), opts = {}) {
  if (stryMutAct_9fa48("294")) {
    {}
  } else {
    stryCov_9fa48("294");
    if (stryMutAct_9fa48("297") ? (!text?.trim() || !config.CLAUDE_API_KEY) && breaker.getState() === STATE.OPEN : stryMutAct_9fa48("296") ? false : stryMutAct_9fa48("295") ? true : (stryCov_9fa48("295", "296", "297"), (stryMutAct_9fa48("299") ? !text?.trim() && !config.CLAUDE_API_KEY : stryMutAct_9fa48("298") ? false : (stryCov_9fa48("298", "299"), (stryMutAct_9fa48("300") ? text?.trim() : (stryCov_9fa48("300"), !(stryMutAct_9fa48("302") ? text.trim() : stryMutAct_9fa48("301") ? text : (stryCov_9fa48("301", "302"), text?.trim())))) || (stryMutAct_9fa48("303") ? config.CLAUDE_API_KEY : (stryCov_9fa48("303"), !config.CLAUDE_API_KEY)))) || (stryMutAct_9fa48("305") ? breaker.getState() !== STATE.OPEN : stryMutAct_9fa48("304") ? false : (stryCov_9fa48("304", "305"), breaker.getState() === STATE.OPEN)))) return text;
    if (stryMutAct_9fa48("308") ? targetLang !== 'fr' : stryMutAct_9fa48("307") ? false : stryMutAct_9fa48("306") ? true : (stryCov_9fa48("306", "307", "308"), targetLang === (stryMutAct_9fa48("309") ? "" : (stryCov_9fa48("309"), 'fr')))) return text;
    try {
      if (stryMutAct_9fa48("310")) {
        {}
      } else {
        stryCov_9fa48("310");
        const json = await _call(stryMutAct_9fa48("311") ? {} : (stryCov_9fa48("311"), {
          model: config.CLAUDE_MODEL,
          max_tokens: 256,
          temperature: 0.3,
          system: stryMutAct_9fa48("312") ? "" : (stryCov_9fa48("312"), 'Tu es un traducteur. Traduis fidèlement le texte dans la langue cible. Conserve le sens et le ton.'),
          messages: stryMutAct_9fa48("313") ? [] : (stryCov_9fa48("313"), [stryMutAct_9fa48("314") ? {} : (stryCov_9fa48("314"), {
            role: stryMutAct_9fa48("315") ? "" : (stryCov_9fa48("315"), 'user'),
            content: stryMutAct_9fa48("316") ? `` : (stryCov_9fa48("316"), `Texte : "${_escJson(text)}"\nLangue cible : ${targetLang}`)
          })])
        }), stryMutAct_9fa48("317") ? {} : (stryCov_9fa48("317"), {
          requestId: opts.requestId
        }));
        return stryMutAct_9fa48("320") ? json.content?.[0]?.text?.trim() && text : stryMutAct_9fa48("319") ? false : stryMutAct_9fa48("318") ? true : (stryCov_9fa48("318", "319", "320"), (stryMutAct_9fa48("324") ? json.content[0]?.text?.trim() : stryMutAct_9fa48("323") ? json.content?.[0].text?.trim() : stryMutAct_9fa48("322") ? json.content?.[0]?.text.trim() : stryMutAct_9fa48("321") ? json.content?.[0]?.text : (stryCov_9fa48("321", "322", "323", "324"), json.content?.[0]?.text?.trim())) || text);
      }
    } catch (err) {
      if (stryMutAct_9fa48("325")) {
        {}
      } else {
        stryCov_9fa48("325");
        log.warn(stryMutAct_9fa48("326") ? {} : (stryCov_9fa48("326"), {
          requestId: opts.requestId,
          err: err.message
        }), stryMutAct_9fa48("327") ? "" : (stryCov_9fa48("327"), 'Claude translate failed — returning original'));
        return text;
      }
    }
  }
}