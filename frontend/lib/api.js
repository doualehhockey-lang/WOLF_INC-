// frontend/lib/api.js — Centralized API client for Wolf Engine frontend.
//
// All routes use /api/wolf prefix (rewritten to backend by next.config.mjs).
// Auth: access token in sessionStorage + wolf_session flag cookie for middleware.
// Error messages come from backend i18n (Accept-Language header is forwarded).

/** Base URL — always relative so it works without SSR. */
const BASE = '/api/wolf';

// Refresh token lifetime in seconds — must match server-side REFRESH_TTL (7 days).
// Used to set the Max-Age of the wolf_session presence cookie so it expires
// at the same time as the refresh token, not when the browser closes.
const REFRESH_TTL_SECONDS = 7 * 24 * 3600; // 604800

// ── Token management ──────────────────────────────────────────────────────────

/** @returns {string|null} */
export function getToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('wolf_token');
}

/** Store access token and set session presence cookie for middleware. */
export function storeToken(token) {
  sessionStorage.setItem('wolf_token', token);
  // H4 FIX:
  //   - Secure flag: prevents transmission over HTTP in production.
  //   - Max-Age: ties cookie lifetime to refresh token (7 days), not browser session.
  //     Without this, the cookie outlives the JWT expiry and the middleware thinks
  //     the user is authenticated when they are not (sessionStorage is cleared on
  //     tab close but cookie persists across browser restarts).
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `wolf_session=1; path=/; SameSite=Strict; Max-Age=${REFRESH_TTL_SECONDS}${secure}`;
}

/** Clear access token and presence cookie. */
export function clearToken() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('wolf_token');
  // Expire the cookie immediately.
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `wolf_session=; path=/; SameSite=Strict; Max-Age=0${secure}`;
}

/** True if there is a stored token. */
export function isAuthenticated() {
  return Boolean(getToken());
}

// ── Core fetch helper ─────────────────────────────────────────────────────────

// Internal flag to prevent infinite refresh loops.
let _refreshInProgress = false;

/**
 * @param {string}      path  — e.g. '/health/ready'
 * @param {RequestInit} init  — standard fetch options
 * @param {boolean}     _isRetry — internal: true when called after a token refresh
 * @returns {Promise<unknown>} parsed JSON body
 * @throws {ApiError}
 */
export async function apiFetch(path, init = {}, _isRetry = false) {
  const token = getToken();

  const headers = new Headers(init.headers ?? {});
  headers.set('Content-Type', 'application/json');
  // Forward user's preferred language so backend i18n translates error messages.
  if (typeof navigator !== 'undefined') {
    headers.set('Accept-Language', navigator.language ?? 'en');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* ignore parse error */
    }

    // H1 FIX: On 401, attempt a silent token refresh then retry the original request once.
    // Previously this just cleared the token and threw — logging the user out every 15 min.
    if (res.status === 401 && !_isRetry && !_refreshInProgress) {
      try {
        _refreshInProgress = true;
        await refreshToken(); // rotates access token via HttpOnly refresh cookie
        _refreshInProgress = false;
        return apiFetch(path, init, true); // retry original request with new token
      } catch {
        _refreshInProgress = false;
        clearToken(); // refresh failed — session is truly expired, redirect to login
        throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired — please log in again');
      }
    }

    if (res.status === 401) clearToken();

    throw new ApiError(res.status, body.error ?? 'API_ERROR', body.message ?? res.statusText);
  }

  if (res.status === 204) return null;
  return res.json();
}

/** SWR-compatible fetcher. */
export async function apiFetcher(path) {
  return apiFetch(path);
}

/** POST helper. */
export async function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
}

/** PATCH helper. */
export async function apiPatch(path, body) {
  return apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
}

/** DELETE helper — body optional. */
export async function apiDelete(path, body) {
  return apiFetch(path, {
    method: 'DELETE',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** GET with query params helper. */
export async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(qs ? `${path}?${qs}` : path);
}

// ── ApiError ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * POST /auth/token — exchange API key for JWT.
 * @param {string} apiKey
 * @returns {{ accessToken: string, expiresIn: string, tokenType: string }}
 */
export async function login(apiKey) {
  const res = await fetch(`${BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(
      res.status,
      body.error ?? 'AUTH_ERROR',
      body.message ?? 'Authentication failed'
    );
  }
  const data = await res.json();
  storeToken(data.accessToken);
  return data;
}

/**
 * POST /auth/signup — create a new salon account.
 * @param {string} salonName
 * @param {string} email
 * @param {string} password
 * @returns {{ accessToken: string, expiresIn: string, tokenType: string, tenantId: string }}
 */
export async function signup(salonName, email, password) {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ salonName, email, password }),
  });
  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, body.error ?? 'SIGNUP_ERROR', body.message ?? 'Signup failed');
  }
  const data = await res.json();
  storeToken(data.accessToken);
  return data;
}

// ── CSRF helpers ─────────────────────────────────────────────────────────────
// /auth/refresh and /auth/logout use double-submit cookie CSRF protection.
// The backend sets wolf_csrf cookie via GET /auth/csrf; we must echo its value
// in the X-CSRF-Token header on every state-changing cookie-authenticated request.

/**
 * Read the wolf_csrf cookie value. Returns null if not yet seeded.
 * @returns {string|null}
 */
function _getCsrfToken() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)wolf_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Ensure the wolf_csrf cookie is present by calling GET /auth/csrf if needed.
 * No-op if the cookie already exists (cached by browser).
 */
async function _ensureCsrf() {
  if (_getCsrfToken()) return;
  // GET /auth/csrf sets the wolf_csrf cookie (not HttpOnly — intentionally readable).
  await fetch(`${BASE}/auth/csrf`, { credentials: 'include' });
}

/**
 * POST /auth/refresh — rotate access token using HttpOnly refresh cookie.
 * Called automatically by apiFetch on 401. Can also be called proactively.
 */
export async function refreshToken() {
  await _ensureCsrf();
  const csrfToken = _getCsrfToken() ?? '';
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrfToken },
  });
  if (!res.ok) {
    clearToken();
    throw new ApiError(res.status, 'REFRESH_FAILED', 'Session expired');
  }
  const data = await res.json();
  storeToken(data.accessToken);
  return data;
}

/**
 * POST /auth/logout — revoke refresh token on backend, clear local state.
 */
export async function logout() {
  try {
    await _ensureCsrf();
    const csrfToken = _getCsrfToken() ?? '';
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken },
    });
  } finally {
    clearToken();
  }
}

// ── Analytics ────────────────────────────────────────────────────────────────

/** @param {string} [period='30d'] */
export const getAnalyticsOverview = (period = '30d') =>
  apiFetch(`/api/analytics/overview?period=${period}`);
/** @param {string} [period='30d'] */
export const getAnalyticsDaily = (period = '30d') =>
  apiFetch(`/api/analytics/daily?period=${period}`);
/** @param {string} [period='30d'] */
export const getAnalyticsServices = (period = '30d') =>
  apiFetch(`/api/analytics/services?period=${period}`);

// ── Public Booking ───────────────────────────────────────────────────────────
// These endpoints are public (no auth required) — they use plain fetch, not apiFetch.

/**
 * GET /api/book/:tenantId/info — public salon info for booking page.
 * @param {string} tenantId
 */
export async function getBookingInfo(tenantId) {
  const res = await fetch(`${BASE}/api/book/${tenantId}/info`);
  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(
      res.status,
      body.error ?? 'API_ERROR',
      body.message ?? 'Failed to load salon info'
    );
  }
  return res.json();
}

/**
 * GET /api/book/:tenantId/slots?date=YYYY-MM-DD — available time slots.
 * @param {string} tenantId
 * @param {string} date — YYYY-MM-DD
 */
export async function getBookingSlots(tenantId, date) {
  const res = await fetch(`${BASE}/api/book/${tenantId}/slots?date=${encodeURIComponent(date)}`);
  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(
      res.status,
      body.error ?? 'API_ERROR',
      body.message ?? 'Failed to load slots'
    );
  }
  return res.json();
}

/**
 * POST /api/book/:tenantId — create a public booking.
 * @param {string} tenantId
 * @param {{ clientName: string, clientPhone: string, service: string, date: string, time: string }} data
 */
export async function createBooking(tenantId, data) {
  const res = await fetch(`${BASE}/api/book/${tenantId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, body.error ?? 'API_ERROR', body.message ?? 'Booking failed');
  }
  return res.json();
}

// ── Health ────────────────────────────────────────────────────────────────────

/** @returns {Promise<{ status: string, uptime: number, checks: object }>} */
export const fetchHealth = () => apiFetch('/health/ready');

// ── Metrics ───────────────────────────────────────────────────────────────────

/**
 * Fetch Prometheus metrics text and parse into a flat map.
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchMetrics() {
  const token = getToken();
  const headers = new Headers({ Accept: 'text/plain' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}/metrics`, { headers });
  if (!res.ok) throw new ApiError(res.status, 'METRICS_ERROR', 'Failed to fetch metrics');

  const text = await res.text();
  const result = {};
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const spaceIdx = line.lastIndexOf(' ');
    if (spaceIdx === -1) continue;
    const key = line
      .slice(0, spaceIdx)
      .replace(/\{[^}]*\}/, '')
      .trim();
    const value = parseFloat(line.slice(spaceIdx + 1));
    if (!Number.isNaN(value)) result[key] = value;
  }
  return result;
}

// ── Deployment ────────────────────────────────────────────────────────────────

export const triggerCanary = tag => apiPost('/deploy/canary', { tag });
export const promoteCanary = () => apiPost('/deploy/promote', {});
export const rollbackDeploy = tag => apiPost('/deploy/rollback', { tag });

// ── Security & Observability ──────────────────────────────────────────────────

export const fetchSecurityEvents = () => apiFetch('/security/events');
export const fetchPods = () => apiFetch('/k8s/pods');
export const fetchHpa = () => apiFetch('/k8s/hpa');
export const fetchTraces = (limit = 50) => apiFetch(`/traces?limit=${limit}`);

/** Returns a raw fetch Response — caller must handle streaming. */
export function streamLogs(component, signal) {
  const token = getToken();
  const url = `${BASE}/logs/stream?component=${encodeURIComponent(component)}`;
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
}

// ── Billing ───────────────────────────────────────────────────────────────────

/**
 * POST /billing/create-checkout — start a Stripe Checkout session.
 * @returns {Promise<{ url: string }>}
 */
export function createCheckoutSession() {
  return apiPost('/billing/create-checkout', {});
}

/**
 * POST /billing/create-portal — open Stripe Billing Portal.
 * @returns {Promise<{ url: string }>}
 */
export function createPortalSession() {
  return apiPost('/billing/create-portal', {});
}

// ── GDPR ──────────────────────────────────────────────────────────────────────
// C3 FIX: phone_number is sent in the request BODY on all three endpoints.
// It must never appear in a query string — that would write PII to access logs.
// The backend export endpoint was changed from GET to POST to support this.

/**
 * POST /api/user/export  { phone_number }
 * Returns full user data package.
 * @param {string} phoneNumber
 */
export function exportUserData(phoneNumber) {
  return apiFetch('/api/user/export', {
    method: 'POST',
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
}

/**
 * DELETE /api/user/data { phone_number }
 * Hard-deletes all user data across all tables.
 * @param {string} phoneNumber
 */
export function deleteUserData(phoneNumber) {
  return apiDelete('/api/user/data', { phone_number: phoneNumber });
}

/**
 * PATCH /api/user/consent { phone_number, consent, consent_version }
 * @param {string}  phoneNumber
 * @param {boolean} consent
 * @param {string}  [consentVersion='1.0']
 */
export function updateConsent(phoneNumber, consent, consentVersion = '1.0') {
  return apiPatch('/api/user/consent', {
    phone_number: phoneNumber,
    consent,
    consent_version: consentVersion,
  });
}
