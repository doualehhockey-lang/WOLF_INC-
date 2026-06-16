// src/infra/http/httpClient.js — Reusable HTTP/HTTPS agents with connection pooling.
// Saves 50-150ms TLS handshake overhead per request to Claude, ElevenLabs, Azure, etc.
// Import apiFetch() instead of bare fetch() for all external API calls.

import https from 'https';
<<<<<<< HEAD
import http from 'http';
=======
import http  from 'http';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

// ── Agents ────────────────────────────────────────────────────────────────────

const httpsAgent = new https.Agent({
<<<<<<< HEAD
  keepAlive: true,
  maxSockets: 50,
  timeout: 30_000,
=======
  keepAlive:  true,
  maxSockets: 50,
  timeout:    30_000,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  scheduling: 'lifo', // reuse most-recently-used sockets first (warmer TLS sessions)
});

const httpAgent = new http.Agent({
<<<<<<< HEAD
  keepAlive: true,
  maxSockets: 20,
  timeout: 30_000,
=======
  keepAlive:  true,
  maxSockets: 20,
  timeout:    30_000,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for fetch() with persistent connection pooling.
 * Automatically selects the HTTP or HTTPS agent based on the URL scheme.
 *
 * @param {string}      url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, options = {}) {
  const agent = url.startsWith('https') ? httpsAgent : httpAgent;

  // Node 18+ has a native fetch that does NOT accept `agent`.
  // Detect the native implementation and skip the agent in that case.
  // For older Node / undici-based environments, pass it normally.
  const nativeFetch = typeof globalThis.fetch === 'function';

  return fetch(url, {
    ...options,
    ...(nativeFetch ? {} : { agent }),
  });
}

/** Expose raw agents for tests or manual socket management. */
export { httpsAgent, httpAgent };
