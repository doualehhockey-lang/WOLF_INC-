// @ts-nocheck
// src/infra/http/agent.js — Reusable HTTP agents with connection pooling.
import https from 'https';
import http from 'http';

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: 30_000,
  scheduling: 'lifo',
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 20,
  timeout: 30_000,
});

export async function apiFetch(url, options = {}) {
  const agent = url.startsWith('https') ? httpsAgent : httpAgent;
  return fetch(url, {
    ...options,
    ...(typeof globalThis.fetch === 'function' ? {} : { agent }),
  });
}

export { httpsAgent, httpAgent };
