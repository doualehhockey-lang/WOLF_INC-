// @ts-nocheck
// src/features/tts/inflight.js — Deduplication map for in-flight TTS synthesis promises.
const _map = new Map();

export function getInflight(key) {
  return _map.get(key);
}

export function setInflight(key, promise) {
  _map.set(key, promise);
  promise.finally(() => _map.delete(key));
}

export function inflightSize() {
  return _map.size;
}
