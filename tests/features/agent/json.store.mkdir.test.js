// tests/features/agent/json.store.mkdir.test.js
// Covers json.store.js line 22: if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
// — TRUE branch when directory does not exist

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    EVENTS_FILE: '/tmp/json-store-mkdir-test/events.json',
<<<<<<< HEAD
    MAX_EVENTS: 100,
=======
    MAX_EVENTS:  100,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
}));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  eventsStoredGauge: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
<<<<<<< HEAD
  errorCounter: { inc: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
}));

// ── Mock fs — existsSync returns FALSE → triggers mkdirSync (line 22 TRUE) ───
const mockMkdirSync = jest.fn();
const mockExistsSync = jest.fn(() => false); // dir does NOT exist
const mockReadFileSync = jest.fn(() => {
  throw new Error('file not found');
});
const mockWriteFile = jest.fn(async () => {});

jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
=======
  errorCounter:      { inc: jest.fn() },
}));

// ── Mock fs — existsSync returns FALSE → triggers mkdirSync (line 22 TRUE) ───
const mockMkdirSync  = jest.fn();
const mockExistsSync = jest.fn(() => false);  // dir does NOT exist
const mockReadFileSync = jest.fn(() => { throw new Error('file not found'); });
const mockWriteFile  = jest.fn(async () => {});

jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  mkdirSync:    mockMkdirSync,
  existsSync:   mockExistsSync,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

jest.unstable_mockModule('fs/promises', () => ({
  writeFile: mockWriteFile,
}));

jest.unstable_mockModule('../../../src/features/agent/write-queue.js', () => ({
  WriteQueue: class MockWriteQueue {
<<<<<<< HEAD
    constructor(fn) {
      this._fn = fn;
    }
    async enqueue() {
      await this._fn();
    }
=======
    constructor(fn) { this._fn = fn; }
    async enqueue() { await this._fn(); }
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
}));

// ── Import json.store after mocks ─────────────────────────────────────────────
// The module runs _load() at import time → _ensureDir() is called → existsSync()
// returns false → mkdirSync() is called (line 22 TRUE branch)
const { createEvent, listEvents } = await import('../../../src/features/agent/json.store.js');

// ═════════════════════════════════════════════════════════════════════════════
// Line 22: mkdirSync called because existsSync returns false
// ═════════════════════════════════════════════════════════════════════════════

describe('json.store — _ensureDir mkdirSync (line 22 TRUE)', () => {
  test('mkdirSync was called during module init when dir does not exist', () => {
    // _load() is called at import time, which calls _ensureDir()
    // existsSync returns false → mkdirSync should have been called
    expect(mockExistsSync).toHaveBeenCalled();
<<<<<<< HEAD
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
=======
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true }
    );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('createEvent works even when dir was initially absent', async () => {
    // After the module loaded (mkdirSync called), operations should work normally
    const event = await createEvent('user-mkdir-test', {
<<<<<<< HEAD
      subject: 'Test',
      date: '2026-12-01',
      time: '10:00',
=======
      subject: 'Test', date: '2026-12-01', time: '10:00',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });
    expect(event).toHaveProperty('id');
    expect(event.subject).toBe('Test');
  });
});
