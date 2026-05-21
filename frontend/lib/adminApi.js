// frontend/lib/adminApi.js — Admin-only API layer for Wolf Engine.
//
// All routes are prefixed with /api/wolf/admin (Next.js rewrites to backend).
// Every call injects the Bearer token from sessionStorage.
// The backend enforces role=admin server-side; we also guard client-side
// (see AdminGuard.js) to avoid pointless round-trips.
//
// Error handling: all functions throw ApiError on non-2xx.
// Callers should wrap in try/catch and surface to the user.

import { apiFetch, apiPost, apiDelete, ApiError } from './api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const adm = (path, init) => apiFetch(`/admin${path}`, init);
const admPost   = (path, body) => apiPost(`/admin${path}`, body);
const admDelete = (path)       => apiDelete(`/admin${path}`);
const admPatch  = (path, body) => apiFetch(`/admin${path}`, {
  method: 'PATCH',
  body:   JSON.stringify(body),
});
const admPut = (path, body) => apiFetch(`/admin${path}`, {
  method: 'PUT',
  body:   JSON.stringify(body),
});

// ── JWT client-side decode (NO verification — server owns that) ───────────────

/**
 * Decode the payload section of a JWT without verifying signature.
 * Used only for client-side role checks + UX (real enforcement is on the server).
 * @param {string} token
 * @returns {{ sub: string, role: string, exp: number }|null}
 */
export function decodeJwtPayload(token) {
  try {
    const [, b64] = token.split('.');
    const json     = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** @returns {boolean} true when the stored token belongs to an admin. */
export function isAdmin() {
  if (typeof window === 'undefined') return false;
  const token   = sessionStorage.getItem('wolf_token');
  if (!token)   return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  // Check expiry client-side (server will also check).
  if (payload.exp && Date.now() / 1000 > payload.exp) return false;
  return payload.role === 'admin';
}

// ── User management ───────────────────────────────────────────────────────────

/**
 * @returns {Promise<{ users: UserRecord[] }>}
 * @typedef {{ id: string, sub: string, email: string, role: string, createdAt: string, lastLogin: string|null }} UserRecord
 */
export const fetchUsers     = ()              => adm('/users');
export const createUser     = (data)          => admPost('/users', data);
export const updateUser     = (id, data)      => admPut(`/users/${id}`, data);
export const deleteUser     = (id)            => admDelete(`/users/${id}`);
export const updateUserRole = (id, role)      => admPatch(`/users/${id}/role`, { role });
export const resetUserPassword = (id)         => admPost(`/users/${id}/reset-password`, {});

// ── API key management ────────────────────────────────────────────────────────

/**
 * @returns {Promise<{ keys: ApiKeyRecord[] }>}
 * @typedef {{
 *   id: string, name: string, prefix: string,
 *   role: string, createdAt: string, lastUsed: string|null,
 *   expiresAt: string|null, revoked: boolean
 * }} ApiKeyRecord
 */
export const fetchApiKeys  = ()         => adm('/api-keys');
/** Returns the full key once — store it; it cannot be retrieved again. */
export const createApiKey  = (data)     => admPost('/api-keys', data);
export const revokeApiKey  = (id)       => admDelete(`/api-keys/${id}`);
/** Returns the NEW full key — store it; old key is invalidated immediately. */
export const rotateApiKey  = (id)       => admPost(`/api-keys/${id}/rotate`, {});

// ── Security logs ─────────────────────────────────────────────────────────────

/**
 * @param {{ type?: string, sub?: string, from?: string, to?: string, limit?: number }} params
 * @returns {Promise<{ events: SecurityEvent[], total: number }>}
 */
export function fetchSecurityLogs(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)),
  ).toString();
  return adm(`/security-logs${qs ? `?${qs}` : ''}`);
}

// ── Observability integrations ────────────────────────────────────────────────

/**
 * Execute a PromQL instant query via the backend proxy.
 * Avoids exposing Prometheus directly; backend validates the query.
 * @param {string} query  — PromQL expression
 * @param {number} [time] — Unix timestamp (default: now)
 */
export function prometheusQuery(query, time) {
  const params = new URLSearchParams({ query });
  if (time) params.set('time', String(time));
  return adm(`/observability/prometheus?${params}`);
}

/**
 * Fetch recent traces from Tempo filtered by a user sub.
 * @param {{ sub?: string, service?: string, limit?: number }} params
 */
export function fetchTempoTraces(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)),
  ).toString();
  return adm(`/observability/traces${qs ? `?${qs}` : ''}`);
}

/**
 * Fetch Grafana panel snapshot URLs for the admin security dashboard.
 * @returns {Promise<{ panels: GrafanaPanel[] }>}
 */
export const fetchGrafanaPanels = () => adm('/observability/grafana/panels');

// ── Deployment (admin overrides) ─────────────────────────────────────────────

export const adminTriggerCanary  = (tag)         => admPost('/deploy/canary',  { tag });
export const adminPromoteCanary  = ()            => admPost('/deploy/promote', {});
export const adminRollback       = (tag)         => admPost('/deploy/rollback', { tag });
export const adminFullDeploy     = (tag, force)  => admPost('/deploy/full',    { tag, force });
export const fetchDeployStatus   = ()            => adm('/deploy/status');
export const fetchDeployHistory  = (limit = 20)  => adm(`/deploy/history?limit=${limit}`);

// ── Cluster (extended with nodes) ────────────────────────────────────────────

export const fetchAdminPods  = ()    => adm('/k8s/pods');
export const fetchAdminHpa   = ()    => adm('/k8s/hpa');
export const fetchNodes      = ()    => adm('/k8s/nodes');
export const fetchNamespaceQuota = ()=> adm('/k8s/quota');
export const deletePod       = (name)=> admDelete(`/k8s/pods/${name}`);

// Re-export shared error type for convenience.
export { ApiError };
