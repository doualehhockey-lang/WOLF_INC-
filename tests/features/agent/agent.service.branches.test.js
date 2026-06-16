// tests/features/agent/agent.service.branches.test.js
// Covers agent.service.js:
//   Lines 15-17: const store = dbAvailable ? dbStore : jsonStore — TRUE branch (db)
//   Lines 80, 85: update_event without effectiveDate → findEventByDate skipped

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockAgentLatency = { startTimer: jest.fn(() => jest.fn()) };
const mockIntentCounter = { inc: jest.fn() };
const mockErrorCounter = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  agentLatency: mockAgentLatency,
  intentCounter: mockIntentCounter,
  errorCounter: mockErrorCounter,
  auditLogFailures: { inc: jest.fn() },
}));

jest.unstable_mockModule('../../../src/features/agent/intent.normalizer.js', () => ({
  normalizeIntent: i => i,
}));

const mockDbStore = {
  listEvents: jest.fn(),
  createEvent: jest.fn(),
  findEventByDate: jest.fn(),
  findEventBySubject: jest.fn(),
  softDeleteEvent: jest.fn(),
  updateEvent: jest.fn(),
};
const mockJsonStore = {
  listEvents: jest.fn(),
  createEvent: jest.fn(),
  findEventByDate: jest.fn(),
  findEventBySubject: jest.fn(),
  softDeleteEvent: jest.fn(),
  updateEvent: jest.fn(),
};

jest.unstable_mockModule('../../../src/features/agent/db.store.js', () => mockDbStore);
jest.unstable_mockModule('../../../src/features/agent/json.store.js', () => mockJsonStore);

// ── dbAvailable: TRUE → uses dbStore (lines 15-17 TRUE branch) ─────────────
jest.unstable_mockModule('../../../src/infra/db/dbClient.js', () => ({
  db: jest.fn(),
  dbAvailable: true, // ← triggers line 15-17 TRUE branch
  pendingMigrationCount: 0,
}));

const { dispatch } = await import('../../../src/features/agent/agent.service.js');

const USER = 'user-branch-test';
const EVT = { id: 99, subject: 'Dentiste', date: '2026-07-15', time: '14:00' };

beforeEach(() => {
  jest.clearAllMocks();
  mockDbStore.listEvents.mockResolvedValue([]);
  mockDbStore.createEvent.mockResolvedValue(EVT);
  mockDbStore.findEventByDate.mockResolvedValue(null);
  mockDbStore.findEventBySubject.mockResolvedValue(null);
  mockDbStore.softDeleteEvent.mockResolvedValue(true);
  mockDbStore.updateEvent.mockResolvedValue(EVT);
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 15-17: dbAvailable TRUE → store = dbStore
// ═════════════════════════════════════════════════════════════════════════════

describe('agent.service — dbStore selection (lines 15-17 TRUE)', () => {
  test('uses dbStore.listEvents when dbAvailable is true', async () => {
    mockDbStore.listEvents.mockResolvedValue([EVT]);

    const result = await dispatch(
      { intent: 'list_events', subject: '', isoDate: null, isoTime: null, date: '', time: '' },
      USER
    );

    expect(result.ok).toBe(true);
    expect(mockDbStore.listEvents).toHaveBeenCalledWith(USER);
    // jsonStore should NOT be called
    expect(mockJsonStore.listEvents).not.toHaveBeenCalled();
  });

  test('uses dbStore.createEvent when dbAvailable is true', async () => {
    const result = await dispatch(
      {
        intent: 'create_event',
        subject: 'Kiné',
        isoDate: '2026-08-01',
        isoTime: '09:00',
        date: '',
        time: '',
      },
      USER
    );

    expect(result.ok).toBe(true);
    expect(mockDbStore.createEvent).toHaveBeenCalled();
    expect(mockJsonStore.createEvent).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 80, 85: update_event WITHOUT effectiveDate
// — findEventByDate skipped (line 80 FALSE) → uses last event
// — patch.date not set (line 85 FALSE branch)
// ═════════════════════════════════════════════════════════════════════════════

describe('update_event — no effectiveDate (lines 80, 85 FALSE)', () => {
  test('updates last event when no date provided (line 80 FALSE → null target)', async () => {
    mockDbStore.listEvents.mockResolvedValue([EVT]);
    mockDbStore.updateEvent.mockResolvedValue({ ...EVT, subject: 'Kiné' });

    const result = await dispatch(
      {
        intent: 'update_event',
        subject: 'Kiné',
        isoDate: null, // no date → effectiveDate = null || '' = ''  (falsy)
        isoTime: null,
        date: '',
        time: '',
      },
      USER
    );

    expect(result.ok).toBe(true);
    // findEventByDate should NOT be called (line 80 FALSE → skip)
    expect(mockDbStore.findEventByDate).not.toHaveBeenCalled();
    // updateEvent should be called with a patch WITHOUT a date field (line 85 FALSE)
    const updateArg = mockDbStore.updateEvent.mock.calls[0]?.[2] ?? {};
    expect(updateArg).not.toHaveProperty('date');
    expect(updateArg).toHaveProperty('subject', 'Kiné');
  });

  test('update_event with time but no date (line 85 FALSE, time in patch)', async () => {
    mockDbStore.listEvents.mockResolvedValue([EVT]);

    await dispatch(
      {
        intent: 'update_event',
        subject: '',
        isoDate: null,
        isoTime: '10:30', // has time
        date: '',
        time: '',
      },
      USER
    );

    const updateArg = mockDbStore.updateEvent.mock.calls[0]?.[2] ?? {};
    // No date in patch (line 85 FALSE), but time IS in patch (line 86 TRUE)
    expect(updateArg).not.toHaveProperty('date');
    expect(updateArg).toHaveProperty('time', '10:30');
  });
});
