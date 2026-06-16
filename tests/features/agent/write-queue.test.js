// tests/features/agent/write-queue.test.js

import { WriteQueue } from '../../../src/features/agent/write-queue.js';

describe('WriteQueue', () => {
  test('constructor rejects non-function writeFn', () => {
    expect(() => new WriteQueue('not a function')).toThrow(TypeError);
  });

  test('executes writeFn on enqueue', async () => {
    const calls = [];
<<<<<<< HEAD
    const q = new WriteQueue(async () => {
      calls.push(Date.now());
    });
=======
    const q     = new WriteQueue(async () => { calls.push(Date.now()); });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await q.enqueue();
    expect(calls).toHaveLength(1);
  });

  test('concurrent enqueues do not run writeFn in parallel', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const q = new WriteQueue(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 20));
      concurrent--;
    });

    await Promise.all([q.enqueue(), q.enqueue(), q.enqueue()]);
    expect(maxConcurrent).toBe(1);
  });

  test('pending write fires after in-flight completes', async () => {
    const calls = [];
    let resolve1;

    const q = new WriteQueue(async () => {
      calls.push(Date.now());
      if (calls.length === 1) {
        // Block on first write to observe pending behaviour
<<<<<<< HEAD
        await new Promise(r => {
          resolve1 = r;
        });
=======
        await new Promise(r => { resolve1 = r; });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      }
    });

    const p1 = q.enqueue();
    const p2 = q.enqueue(); // should be marked pending

    expect(q.hasPending).toBe(true);
    resolve1(); // unblock first write
    await Promise.all([p1, p2]);

    // writeFn must have been called at least twice (once for each batch)
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  test('isRunning and hasPending flags', async () => {
    let unblock;
    const q = new WriteQueue(async () => {
<<<<<<< HEAD
      await new Promise(r => {
        unblock = r;
      });
=======
      await new Promise(r => { unblock = r; });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });

    const p = q.enqueue();
    expect(q.isRunning).toBe(true);
    unblock();
    await p;
    expect(q.isRunning).toBe(false);
  });

  test('recovers gracefully from writeFn errors', async () => {
    let count = 0;
<<<<<<< HEAD
    const q = new WriteQueue(async () => {
=======
    const q   = new WriteQueue(async () => {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      count++;
      if (count === 1) throw new Error('simulated write failure');
    });

    await q.enqueue(); // should not throw — error is caught internally
    await q.enqueue(); // second write must still execute
    expect(count).toBe(2);
  });
});
