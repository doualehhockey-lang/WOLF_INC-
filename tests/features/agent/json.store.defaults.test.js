// tests/features/agent/json.store.defaults.test.js
// Covers json.store.js line 28: destructuring defaults
//   const { events = {}, counter = 1 } = JSON.parse(readFileSync(...))
// — both TRUE branches (defaults used) when JSON has no events/counter fields

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    EVENTS_FILE: '/tmp/json-store-defaults-test/events.json',
    MAX_EVENTS:  100,
  },
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  eventsStoredGauge: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  errorCounter:      { inc: jest.fn() },
}));

// fs mocks: existsSync=true (dir exists, no mkdirSync needed),
// readFileSync returns '{}' → JSON has no events or counter fields
// → destructuring defaults { events = {}, counter = 1 } both fire (line 28 TRUE branches)
const mockReadFileSync = jest.fn(() => '{}');
const mockExistsSync   = jest.fn(() => true);
const mockMkdirSync    = jest.fn();
const mockWriteFile    = jest.fn(async () => {});

jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  mkdirSync:    mockMkdirSync,
  existsSync:   mockExistsSync,
}));

jest.unstable_mockModule('fs/promises', () => ({
  writeFile: mockWriteFile,
}));

jest.unstable_mockModule('../../../src/features/agent/write-queue.js', () => ({
  WriteQueue: class MockWriteQueue {
    constructor(fn) { this._fn = fn; }
    async enqueue() { await this._fn(); }
  },
}));

// Import AFTER mocks — module-level _load() runs at import time:
//   existsSync=true → no mkdirSync called
//   readFileSync returns '{}' → JSON.parse→{} → events=undefined→{} (TRUE branch), counter=undefined→1 (TRUE branch)
const { listEvents } = await import('../../../src/features/agent/json.store.js');

// ═════════════════════════════════════════════════════════════════════════════
// Line 28: destructuring defaults triggered when JSON has no events/counter
// ═════════════════════════════════════════════════════════════════════════════

describe('json.store — line 28 destructuring defaults (both TRUE branches)', () => {
  test('store initializes to empty when JSON has no events field', async () => {
    // _load() was called at import time with '{}' JSON.
    // events defaults to {} (TRUE branch), counter defaults to 1 (TRUE branch).
    // listEvents should return an empty array.
    const events = await listEvents('any-user');
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(0);
  });

  test('readFileSync was called during module init', () => {
    expect(mockReadFileSync).toHaveBeenCalled();
    // existsSync=true → mkdirSync was NOT called
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });
});
