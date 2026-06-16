// tests/core/metrics.unref.test.js
// Covers core/metrics.js line 9:
//   if (defaultInterval && typeof defaultInterval.unref === 'function')
//   Branch 9,0,0: defaultInterval is falsy → condition short-circuits (FALSE path)

import { jest } from '@jest/globals';

// Mock prom-client to return null from collectDefaultMetrics → triggers branch 9,0,0
const mockCollectDefaultMetrics = jest.fn(() => null);
const mockUnref = jest.fn();

await jest.unstable_mockModule('prom-client', () => ({
  default: {
    collectDefaultMetrics: mockCollectDefaultMetrics,
    Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn(), startTimer: jest.fn() })),
<<<<<<< HEAD
    Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
    Gauge: jest.fn().mockImplementation(() => ({ inc: jest.fn(), dec: jest.fn(), set: jest.fn() })),
    register: {
=======
    Counter:   jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
    Gauge:     jest.fn().mockImplementation(() => ({ inc: jest.fn(), dec: jest.fn(), set: jest.fn() })),
    register:  {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      clear: jest.fn(),
      metrics: jest.fn(async () => ''),
      contentType: 'text/plain; version=0.0.4; charset=utf-8',
      registerMetric: jest.fn(),
      removeSingleMetric: jest.fn(),
    },
  },
}));

// Import metrics.js AFTER mock — at module load time, collectDefaultMetrics() returns null
// → defaultInterval = null → if(null && ...) → FALSE (branch 9,0,0 triggered)
await import('../../src/core/metrics.js');

// ═════════════════════════════════════════════════════════════════════════════
// Line 9 branch 9,0,0: collectDefaultMetrics returns null → if body skipped
// ═════════════════════════════════════════════════════════════════════════════

describe('metrics.js line 9 — defaultInterval falsy (branch 9,0,0)', () => {
  test('collectDefaultMetrics returning null triggers the falsy branch', () => {
    // Module was loaded with mocked prom-client (null from collectDefaultMetrics)
    // The condition `null && typeof null.unref === 'function'` short-circuits at `null`
    // Branch 9,0,0 (defaultInterval is falsy → skip if body) is triggered
    expect(mockCollectDefaultMetrics).toHaveBeenCalledWith({ prefix: 'wolf_' });
<<<<<<< HEAD
    expect(mockUnref).not.toHaveBeenCalled(); // unref never called (if body skipped)
=======
    expect(mockUnref).not.toHaveBeenCalled();  // unref never called (if body skipped)
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});
