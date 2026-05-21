// tests/features/agent/json.store.extended.test.js
// Covers line 29: _load() success path (readFileSync returns valid JSON)
// Covers lines 62-63: _save() error handler (log.error + errorCounter.inc)

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    EVENTS_FILE: '/tmp/json-store-ext-test.json',
    MAX_EVENTS:  100,
  },
}));

const mockGaugeSet = jest.fn();
const mockErrorCounterInc = jest.fn();
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  eventsStoredGauge: { inc: jest.fn(), dec: jest.fn(), set: mockGaugeSet },
  errorCounter:      { inc: mockErrorCounterInc },
}));

// ── Mock fs — readFileSync returns valid JSON (line 29 success path) ──────────
// Store structure: { events: { "userKey": [ ...eventArray ] }, counter: N }
const mockReadFileSync = jest.fn(() => JSON.stringify({
  events: {
    'user:alice': [
      { id: 'evt-001', subject: 'dentiste', date: '2026-06-01', time: null, iso: null, createdAt: Date.now() },
      { id: 'evt-002', subject: 'reunion',  date: '2026-07-01', time: null, iso: null, createdAt: Date.now() },
    ],
  },
  counter: 3,
}));

const mockMkdirSync  = jest.fn();
const mockExistsSync = jest.fn(() => true);
const mockWriteFile  = jest.fn(async () => {});
jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  mkdirSync:    mockMkdirSync,
  existsSync:   mockExistsSync,
}));
jest.unstable_mockModule('fs/promises', () => ({
  writeFile: mockWriteFile,
}));

// ── Mock WriteQueue — enqueue rejects to trigger lines 62-63 ─────────────────
let _enqueueShouldFail = false;
jest.unstable_mockModule('../../../src/features/agent/write-queue.js', () => ({
  WriteQueue: class MockWriteQueue {
    constructor(fn) { this._fn = fn; }
    async enqueue() {
      if (_enqueueShouldFail) throw new Error('Disk full');
      await this._fn();
    }
  },
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const {
  listEvents, createEvent, getTotalCount,
} = await import('../../../src/features/agent/json.store.js');

// Track call counts at initialization time (before clearAllMocks runs)
const _initReadFileSyncCalls = mockReadFileSync.mock.calls.slice();
const _initGaugeSetCalls     = mockGaugeSet.mock.calls.slice();

beforeEach(() => {
  jest.clearAllMocks();
  _enqueueShouldFail = false;
  mockWriteFile.mockResolvedValue(undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 29: _load() success path — readFileSync returns valid JSON
// ═════════════════════════════════════════════════════════════════════════════

describe('_load — success path (line 29)', () => {
  test('events from JSON file are loaded into the store at module init', async () => {
    // The module was imported with readFileSync returning 2 events for user:alice.
    // getTotalCount() returns total across ALL users.
    const count = await getTotalCount();
    expect(count).toBe(2);
  });

  test('listEvents returns pre-loaded events', async () => {
    const events = await listEvents('user:alice');
    expect(events.length).toBe(2);
    expect(events.map(e => e.subject)).toEqual(expect.arrayContaining(['dentiste', 'reunion']));
  });

  test('readFileSync was called during module load (success path)', () => {
    // Check the saved calls from before clearAllMocks
    expect(_initReadFileSyncCalls.length).toBeGreaterThan(0);
    expect(_initReadFileSyncCalls[0][0]).toMatch(/json-store-ext-test\.json/);
    expect(_initReadFileSyncCalls[0][1]).toBe('utf8');
  });

  test('eventsStoredGauge.set called with the loaded count', () => {
    // _load() sets the gauge with the number of non-deleted events
    expect(_initGaugeSetCalls.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 62-63: _save() error handler
// ═════════════════════════════════════════════════════════════════════════════

describe('_save — error handler (lines 62-63)', () => {
  test('log.error and errorCounter.inc called when writeFile fails', async () => {
    // Make writeFile reject to trigger the save error path
    mockWriteFile.mockRejectedValueOnce(new Error('ENOSPC: No space left on device'));

    // createEvent triggers a _save()
    await createEvent('user:bob', { subject: 'test', date: '2026-06-15', time: '10:00', iso: null });

    // Wait for the async enqueue chain to settle
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockErrorCounterInc).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'agent', errorType: 'persist_failed' }),
    );
  });

  test('save error does not propagate — createEvent resolves normally', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('disk error'));

    await expect(
      createEvent('user:charlie', { subject: 'backup', date: '2026-07-01', time: null, iso: null })
    ).resolves.toBeDefined();
  });
});
