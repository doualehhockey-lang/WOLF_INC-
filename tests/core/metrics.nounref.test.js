// tests/core/metrics.nounref.test.js
// Covers core/metrics.js line 9 branch 9,1,1:
//   typeof defaultInterval.unref !== 'function' → if body NOT entered
// collectDefaultMetrics returns an object WITHOUT unref method

import { jest } from '@jest/globals';

// Mock prom-client to return a plain object (no unref method) from collectDefaultMetrics
// → branch 9,1,1: defaultInterval is truthy but unref is NOT a function → condition FALSE
const mockCollectDefaultMetrics = jest.fn(() => ({ ref: jest.fn() })); // has ref but no unref

await jest.unstable_mockModule('prom-client', () => ({
  default: {
    collectDefaultMetrics: mockCollectDefaultMetrics,
    Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn(), startTimer: jest.fn() })),
    Counter:   jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
    Gauge:     jest.fn().mockImplementation(() => ({ inc: jest.fn(), dec: jest.fn(), set: jest.fn() })),
    register:  {
      clear: jest.fn(),
      metrics: jest.fn(async () => ''),
      contentType: 'text/plain; version=0.0.4; charset=utf-8',
      registerMetric: jest.fn(),
      removeSingleMetric: jest.fn(),
    },
  },
}));

// Import metrics.js AFTER mock — collectDefaultMetrics returns { ref: fn } (no unref)
// → defaultInterval = { ref: fn } (truthy) → typeof { ref: fn }.unref === 'function' → FALSE
// → branch 9,1,1 triggered (has interval but no unref → if body skipped)
await import('../../src/core/metrics.js');

// ═════════════════════════════════════════════════════════════════════════════
// Line 9 branch 9,1,1: interval exists but unref is not a function
// ═════════════════════════════════════════════════════════════════════════════

describe('metrics.js line 9 — unref not a function (branch 9,1,1)', () => {
  test('object without unref → typeof check fails → if body not entered', () => {
    // Module loaded with collectDefaultMetrics returning { ref: fn } (no unref)
    // Condition: defaultInterval(truthy) && typeof undefined === 'function' → false
    // Branch 9,1,1 (unref is not a function) is triggered
    expect(mockCollectDefaultMetrics).toHaveBeenCalledWith({ prefix: 'wolf_' });
    // No assertion on unref since it wasn't called
  });
});
