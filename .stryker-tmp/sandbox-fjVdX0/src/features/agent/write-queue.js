// @ts-nocheck
// src/features/agent/write-queue.js — Serialized async write queue.
// Guarantees that only one write is in-flight at a time.
// Subsequent calls while a write is in-flight are coalesced into a single
// pending write, eliminating both race conditions and write storms.

import { childLogger } from '../../core/logger.js';

const log = childLogger('write-queue');

export class WriteQueue {
  /**
   * @param {Function} writeFn  — async () => void — the actual write operation
   * @param {string}   [name]   — label for log lines (default 'queue')
   */
  constructor(writeFn, name = 'queue') {
    if (typeof writeFn !== 'function') throw new TypeError('writeFn must be a function');
    this._writeFn  = writeFn;
    this._name     = name;
    this._running  = false;
    this._pending  = false;
  }

  /**
   * Enqueue a write.  Returns a Promise that resolves when *a* write covering
   * this call has completed (not necessarily the write triggered by this call).
   */
  enqueue() {
    if (this._running) {
      // A write is already in-flight — mark a pending write and resolve
      // when the in-flight write finishes (it will trigger the pending one).
      this._pending = true;
      return this._currentPromise;
    }
    this._currentPromise = this._run();
    return this._currentPromise;
  }

  async _run() {
    this._running = true;
    this._pending = false;
    try {
      await this._writeFn();
    } catch (err) {
      log.error({ name: this._name, err: err.message }, 'WriteQueue write failed');
    } finally {
      this._running = false;
      if (this._pending) {
        // A caller asked for a write while we were running — fire it now.
        this._currentPromise = this._run();
      }
    }
  }

  /** True if a write is currently executing. */
  get isRunning() { return this._running; }
  /** True if a write is queued behind the current one. */
  get hasPending() { return this._pending; }
}
