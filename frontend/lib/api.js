// frontend/lib/api.js — Typed fetch wrapper for the Wolf Engine backend.
//
// All routes are prefixed with /api/wolf (rewritten to the backend by next.config.mjs).
// Authentication uses an access token stored in sessionStorage (never cookies — avoids
// CSRF).  The token is injected into every request via the Authorization header.
//
// Usage (SWR):
//   const { data } = useSWR('/metrics', apiFetcher, { refreshInterval: 5000 });
//
// Usage (mutations):
//   const result = await apiPost('/deploy/canary', { tag: 'sha-abc' });

/** Base URL — always relative so it works in SSR-less pages contexts. */
const BASE = '/api/wolf';

// ── Token management ──────────────────────────────────────────────────────────
// sessionStorage is cleared when the tab closes; use localStorage if persistence
// across sessions is desired (update storeToken / clearToken accordingly).

/** @returns {string|null} */
export function getToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('wolf_token');
}

/** @param {string} token */
export function storeToken(token) {
  sessionStorage.setItem('wolf_token', token);
}

export function clearToken() {
  sessionStorage.removeItem('wolf_token');
}

// ── Core fetch helper ─────────────────────────────────────────────────────────

/**
 * @param {string} path      — e.g. '/health/ready'
 * @param {RequestInit} init — standard fetch options
 * @returns {Promise<unknown>} parsed JSON body
 * @throws {ApiError}
 */
export async function apiFetch(path, init = {}) {
  const token = getToken();

  const headers = new Headers(init.headers ?? {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch { /* ignore parse error */ }
    throw new ApiError(res.status, body.error ?? 'API_ERROR', body.message ?? res.statusText);
  }

  // 204 No Content — return null
  if (res.status === 204) return null;

  return res.json();
}

/** SWR-compatible fetcher — use as the second arg to useSWR. */
export async function apiFetcher(path) {
  return apiFetch(path);
}

/** POST helper. */
export async function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
}

/** DELETE helper. */
export async function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}

// ── Domain error ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.name    = 'ApiError';
    this.status  = status;
    this.code    = code;
  }
}

// ── Domain-specific helpers ───────────────────────────────────────────────────
// These are thin wrappers over apiFetch that encode the API contract.

/** @returns {Promise<{ status: string, uptime: number }>} */
export const fetchHealth = () => apiFetch('/health/ready');

/**
 * Fetch raw Prometheus metrics text and parse into a simple map.
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchMetrics() {
  const token   = getToken();
  const headers = new Headers({ Accept: 'text/plain' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}/metrics`, { headers });
  if (!res.ok) throw new ApiError(res.status, 'METRICS_ERROR', 'Failed to fetch metrics');

  const text   = await res.text();
  const result = {};

  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const spaceIdx = line.lastIndexOf(' ');
    if (spaceIdx === -1) continue;
    const key   = line.slice(0, spaceIdx).replace(/\{[^}]*\}/, '').trim();
    const value = parseFloat(line.slice(spaceIdx + 1));
    if (!Number.isNaN(value)) result[key] = value;
  }

  return result;
}

/** Trigger a canary deployment. */
export const triggerCanary  = (tag)  => apiPost('/deploy/canary', { tag });
/** Promote canary to stable. */
export const promoteCanary  = ()     => apiPost('/deploy/promote', {});
/** Roll back to the previous stable image. */
export const rollbackDeploy = (tag)  => apiPost('/deploy/rollback', { tag });

/** Fetch recent auth / security events. */
export const fetchSecurityEvents = () => apiFetch('/security/events');

/** Fetch Kubernetes pod list for the namespace. */
export const fetchPods = () => apiFetch('/k8s/pods');

/** Fetch HPA status for all components. */
export const fetchHpa  = () => apiFetch('/k8s/hpa');

/** Fetch recent OTel traces. */
export const fetchTraces = (limit = 50) => apiFetch(`/traces?limit=${limit}`);

/** Stream logs — returns a ReadableStream; caller must call reader.cancel() on unmount. */
export function streamLogs(component, signal) {
  const token = getToken();
  const url    = `${BASE}/logs/stream?component=${encodeURIComponent(component)}`;
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
}
