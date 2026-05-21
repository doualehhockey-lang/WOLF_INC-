// @ts-nocheck
// src/features/agent/write-queue.js — Serializes async writes per key, coalesces rapid updates.
const _queues = new Map();

export async function enqueueWrite(key, fn) {
  const existing = _queues.get(key);
  if (existing?.running) {
    existing.dirty = true;
    existing.fn = fn;
    return;
  }
  const slot = { running: true, dirty: false, fn };
  _queues.set(key, slot);
  try {
    await fn();
    if (slot.dirty) {
      slot.dirty = false;
      await slot.fn();
    }
  } finally {
    _queues.delete(key);
  }
}
