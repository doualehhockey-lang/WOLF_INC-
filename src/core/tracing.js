// src/core/tracing.js — Tracing stub (OpenTelemetry supprimé pour le MVP).
// Toutes les fonctions sont des no-ops. Réactiver OTel à partir de 500 clients.

export async function initTracing() {}
export async function shutdownTracing() {}
export function startSpan() {
  return { setAttributes: () => {}, setStatus: () => {}, recordException: () => {}, end: () => {} };
}
export async function withSpan(_name, _attrs, fn) {
  return fn(startSpan());
}
