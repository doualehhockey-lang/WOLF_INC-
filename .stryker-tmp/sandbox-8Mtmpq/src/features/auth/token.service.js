// @ts-nocheck
// src/features/auth/token.service.js — JWT access + refresh token lifecycle.
// Access tokens expire in 15 min; refresh tokens in 7 days.
// Tokens are signed with separate secrets (JWT_SECRET / JWT_REFRESH_SECRET).
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
import jwt from 'jsonwebtoken';
import { config } from '../../core/config.js';
import { childLogger } from '../../core/logger.js';
import { cacheSet, cacheGet, cacheDel } from '../../infra/redis/redisClient.js';
import crypto from 'crypto';
const log = childLogger(stryMutAct_9fa48("0") ? "" : (stryCov_9fa48("0"), 'auth'));
const ACCESS_TTL = stryMutAct_9fa48("1") ? 15 / 60 : (stryCov_9fa48("1"), 15 * 60); // 15 min (seconds)
const REFRESH_TTL = stryMutAct_9fa48("2") ? 7 * 24 / 3600 : (stryCov_9fa48("2"), (stryMutAct_9fa48("3") ? 7 / 24 : (stryCov_9fa48("3"), 7 * 24)) * 3600); // 7 days

/**
 * Issue a short-lived access token and a long-lived refresh token.
 * @param {{ sub: string, role?: string }} payload
 * @returns {{ accessToken: string, refreshToken: string, expiresIn: number }}
 */
export async function issueTokens(payload) {
  if (stryMutAct_9fa48("4")) {
    {}
  } else {
    stryCov_9fa48("4");
    const base = stryMutAct_9fa48("5") ? {} : (stryCov_9fa48("5"), {
      sub: payload.sub,
      role: stryMutAct_9fa48("6") ? payload.role && 'user' : (stryCov_9fa48("6"), payload.role ?? (stryMutAct_9fa48("7") ? "" : (stryCov_9fa48("7"), 'user')))
    });
    const accessToken = jwt.sign(base, config.JWT_SECRET, stryMutAct_9fa48("8") ? {} : (stryCov_9fa48("8"), {
      expiresIn: ACCESS_TTL,
      algorithm: stryMutAct_9fa48("9") ? "" : (stryCov_9fa48("9"), 'HS256')
    }));

    // Create a refresh token with a jti and store the jti in Redis for revocation checks.
    const jti = crypto.randomUUID();
    const refreshToken = jwt.sign(stryMutAct_9fa48("10") ? {} : (stryCov_9fa48("10"), {
      sub: payload.sub,
      jti
    }), config.JWT_REFRESH_SECRET, stryMutAct_9fa48("11") ? {} : (stryCov_9fa48("11"), {
      expiresIn: REFRESH_TTL,
      algorithm: stryMutAct_9fa48("12") ? "" : (stryCov_9fa48("12"), 'HS256')
    }));
    try {
      if (stryMutAct_9fa48("13")) {
        {}
      } else {
        stryCov_9fa48("13");
        await cacheSet(stryMutAct_9fa48("14") ? `` : (stryCov_9fa48("14"), `rt:${jti}`), stryMutAct_9fa48("15") ? "" : (stryCov_9fa48("15"), '1'), REFRESH_TTL);
      }
    } catch (err) {
      if (stryMutAct_9fa48("16")) {
        {}
      } else {
        stryCov_9fa48("16");
        // Best-effort: if cache unavailable, proceed but log.
        log.warn(stryMutAct_9fa48("17") ? {} : (stryCov_9fa48("17"), {
          err: err.message
        }), stryMutAct_9fa48("18") ? "" : (stryCov_9fa48("18"), 'Failed to persist refresh token jti'));
      }
    }
    log.info(stryMutAct_9fa48("19") ? {} : (stryCov_9fa48("19"), {
      sub: payload.sub,
      role: base.role
    }), stryMutAct_9fa48("20") ? "" : (stryCov_9fa48("20"), 'Tokens issued'));
    return stryMutAct_9fa48("21") ? {} : (stryCov_9fa48("21"), {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TTL
    });
  }
}

/**
 * Verify an access token.
 * @param {string} token
 * @returns {{ sub: string, role: string }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
export function verifyAccess(token) {
  if (stryMutAct_9fa48("22")) {
    {}
  } else {
    stryCov_9fa48("22");
    return jwt.verify(token, config.JWT_SECRET, stryMutAct_9fa48("23") ? {} : (stryCov_9fa48("23"), {
      algorithms: stryMutAct_9fa48("24") ? [] : (stryCov_9fa48("24"), [stryMutAct_9fa48("25") ? "" : (stryCov_9fa48("25"), 'HS256')])
    }));
  }
}

/**
 * Verify a refresh token and issue a new token pair.
 * @param {string} token
 * @returns {{ accessToken: string, refreshToken: string, expiresIn: number }}
 */
export async function refreshTokens(token) {
  if (stryMutAct_9fa48("26")) {
    {}
  } else {
    stryCov_9fa48("26");
    const payload = jwt.verify(token, config.JWT_REFRESH_SECRET, stryMutAct_9fa48("27") ? {} : (stryCov_9fa48("27"), {
      algorithms: stryMutAct_9fa48("28") ? [] : (stryCov_9fa48("28"), [stryMutAct_9fa48("29") ? "" : (stryCov_9fa48("29"), 'HS256')])
    }));

    // Verify jti still valid (not revoked)
    if (stryMutAct_9fa48("32") ? false : stryMutAct_9fa48("31") ? true : stryMutAct_9fa48("30") ? payload.jti : (stryCov_9fa48("30", "31", "32"), !payload.jti)) throw new Error(stryMutAct_9fa48("33") ? "" : (stryCov_9fa48("33"), 'Missing refresh token id'));
    try {
      if (stryMutAct_9fa48("34")) {
        {}
      } else {
        stryCov_9fa48("34");
        const exists = await cacheGet(stryMutAct_9fa48("35") ? `` : (stryCov_9fa48("35"), `rt:${payload.jti}`));
        if (stryMutAct_9fa48("38") ? false : stryMutAct_9fa48("37") ? true : stryMutAct_9fa48("36") ? exists : (stryCov_9fa48("36", "37", "38"), !exists)) throw new Error(stryMutAct_9fa48("39") ? "" : (stryCov_9fa48("39"), 'Refresh token revoked'));
      }
    } catch (err) {
      if (stryMutAct_9fa48("40")) {
        {}
      } else {
        stryCov_9fa48("40");
        log.warn(stryMutAct_9fa48("41") ? {} : (stryCov_9fa48("41"), {
          err: err.message
        }), stryMutAct_9fa48("42") ? "" : (stryCov_9fa48("42"), 'Refresh token validation failed'));
        throw err;
      }
    }

    // Rotate: issue new pair, persist new jti, remove old jti
    const newTokens = await issueTokens(stryMutAct_9fa48("43") ? {} : (stryCov_9fa48("43"), {
      sub: payload.sub
    }));
    try {
      if (stryMutAct_9fa48("44")) {
        {}
      } else {
        stryCov_9fa48("44");
        // Delete old jti
        await cacheDel(stryMutAct_9fa48("45") ? `` : (stryCov_9fa48("45"), `rt:${payload.jti}`));
      }
    } catch (err) {
      if (stryMutAct_9fa48("46")) {
        {}
      } else {
        stryCov_9fa48("46");
        log.warn(stryMutAct_9fa48("47") ? {} : (stryCov_9fa48("47"), {
          err: err.message
        }), stryMutAct_9fa48("48") ? "" : (stryCov_9fa48("48"), 'Failed to delete old refresh jti'));
      }
    }
    return newTokens;
  }
}