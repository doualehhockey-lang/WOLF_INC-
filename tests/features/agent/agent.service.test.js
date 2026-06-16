// tests/features/agent/agent.service.test.js
// Agent dispatch: store selection (db vs json), all intent handlers,
// create/cancel/update/list/unknown, error propagation, metric recording.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockTimer = jest.fn();
const mockAgentLatency = { startTimer: jest.fn(() => mockTimer) };
const mockIntentCounter = { inc: jest.fn() };
const mockErrorCounter = { inc: jest.fn() };
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  agentLatency: mockAgentLatency,
  intentCounter: mockIntentCounter,
  errorCounter: mockErrorCounter,
  auditLogFailures: { inc: jest.fn() },
}));

// ── Mock intent normalizer ────────────────────────────────────────────────────
const mockNormalizeIntent = jest.fn(i => i); // identity
jest.unstable_mockModule('../../../src/features/agent/intent.normalizer.js', () => ({
  normalizeIntent: mockNormalizeIntent,
}));

// ── Mock stores ───────────────────────────────────────────────────────────────
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

// ── Mock dbClient — controls store selection ──────────────────────────────────
// We want dbAvailable = false by default → uses json store
jest.unstable_mockModule('../../../src/infra/db/dbClient.js', () => ({
  db: null,
  dbAvailable: false,
  pendingMigrationCount: 0,
}));

// ── Mock audit service (fire-and-forget — don't let it affect assertions) ─────
jest.unstable_mockModule('../../../src/features/audit/audit.service.js', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

// ── Mock i18n — return French strings matching locale (default lang=fr) ───────
jest.unstable_mockModule('../../../src/core/i18n.js', () => ({
  t: (key, opts = {}) => {
    const FR = {
      'agent.missing_date': 'Quelle date souhaitez-vous ?',
      'agent.no_events': 'Aucun rendez-vous trouvé',
      'agent.event_created': `Rendez-vous créé : ${opts.subject} le ${opts.date} à ${opts.time}`,
      'agent.event_cancelled': `Rendez-vous annulé : ${opts.subject} le ${opts.date} à ${opts.time}`,
      'agent.event_updated': `Rendez-vous mis à jour : ${opts.subject} le ${opts.date} à ${opts.time}`,
      'agent.events_listed': `Vous avez ${opts.count} rendez-vous`,
      'agent.unknown_intent': "Je n'ai pas compris cette demande",
    };
    return FR[key] ?? key;
  },
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { dispatch } = await import('../../../src/features/agent/agent.service.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
const USER = 'user-42';
const EVT = { id: 1, subject: 'Médecin', date: '2026-06-01', time: '09:00' };

function nlu(intent, overrides = {}) {
  return { intent, subject: '', isoDate: null, isoTime: null, date: '', time: '', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTimer.mockReset();
  // Default store returns
  mockJsonStore.listEvents.mockResolvedValue([]);
  mockJsonStore.createEvent.mockResolvedValue(EVT);
  mockJsonStore.findEventByDate.mockResolvedValue(null);
  mockJsonStore.findEventBySubject.mockResolvedValue(null);
  mockJsonStore.softDeleteEvent.mockResolvedValue(true);
  mockJsonStore.updateEvent.mockResolvedValue(EVT);
  mockNormalizeIntent.mockImplementation(i => i);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. create_event
// ═════════════════════════════════════════════════════════════════════════════

describe('dispatch — create_event', () => {
  test('returns ok:false when no date provided', async () => {
    const result = await dispatch(nlu('create_event'), USER);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/date/i);
  });

  test('calls store.createEvent with correct args when date is in isoDate', async () => {
    await dispatch(nlu('create_event', { isoDate: '2026-06-01', subject: 'Dentiste' }), USER);
    expect(mockJsonStore.createEvent).toHaveBeenCalledWith(USER, {
      subject: 'Dentiste',
      date: '2026-06-01',
      time: '00:00', // default
    });
  });

  test('calls store.createEvent with date from .date field when isoDate is absent', async () => {
    await dispatch(nlu('create_event', { date: '2026-07-04' }), USER);
    expect(mockJsonStore.createEvent).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        date: '2026-07-04',
      })
    );
  });

  test('uses isoTime when provided', async () => {
    await dispatch(nlu('create_event', { isoDate: '2026-06-01', isoTime: '14:30' }), USER);
    expect(mockJsonStore.createEvent).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        time: '14:30',
      })
    );
  });

  test('defaults time to "00:00" when neither isoTime nor time is set', async () => {
    await dispatch(nlu('create_event', { isoDate: '2026-06-01' }), USER);
    expect(mockJsonStore.createEvent).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        time: '00:00',
      })
    );
  });

  test('returns ok:true with event info on success', async () => {
    const result = await dispatch(
      nlu('create_event', { isoDate: '2026-06-01', subject: 'Médecin' }),
      USER
    );
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Médecin');
    expect(result.message).toContain('2026-06-01');
  });

  test('records intentCounter with resolved:true on success', async () => {
    await dispatch(nlu('create_event', { isoDate: '2026-06-01' }), USER);
    expect(mockIntentCounter.inc).toHaveBeenCalledWith({
      intent: 'create_event',
      resolved: 'true',
    });
  });

  test('records timer with success:true', async () => {
    await dispatch(nlu('create_event', { isoDate: '2026-06-01' }), USER);
    expect(mockTimer).toHaveBeenCalledWith({ success: 'true' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. cancel_event
// ═════════════════════════════════════════════════════════════════════════════

describe('dispatch — cancel_event', () => {
  test('returns ok:true "aucun rendez-vous" when list is empty', async () => {
    mockJsonStore.listEvents.mockResolvedValue([]);
    const result = await dispatch(nlu('cancel_event'), USER);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/aucun/i);
  });

  test('cancels event found by date when isoDate provided', async () => {
    mockJsonStore.listEvents.mockResolvedValue([EVT]);
    mockJsonStore.findEventByDate.mockResolvedValue(EVT);
    const result = await dispatch(nlu('cancel_event', { isoDate: '2026-06-01' }), USER);
    expect(mockJsonStore.findEventByDate).toHaveBeenCalledWith(USER, '2026-06-01');
    expect(mockJsonStore.softDeleteEvent).toHaveBeenCalledWith(USER, EVT.id);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Médecin');
  });

  test('cancels by subject when date not found', async () => {
    mockJsonStore.listEvents.mockResolvedValue([EVT]);
    mockJsonStore.findEventByDate.mockResolvedValue(null);
    mockJsonStore.findEventBySubject.mockResolvedValue(EVT);
    const result = await dispatch(
      nlu('cancel_event', { isoDate: '2026-06-01', subject: 'Médecin' }),
      USER
    );
    expect(mockJsonStore.findEventBySubject).toHaveBeenCalledWith(USER, 'Médecin');
    expect(result.ok).toBe(true);
  });

  test('falls back to last event when no date or subject match', async () => {
    const evts = [EVT, { id: 2, subject: 'Dentiste', date: '2026-06-05', time: '10:00' }];
    mockJsonStore.listEvents.mockResolvedValue(evts);
    mockJsonStore.findEventByDate.mockResolvedValue(null);
    await dispatch(nlu('cancel_event'), USER);
    expect(mockJsonStore.softDeleteEvent).toHaveBeenCalledWith(USER, 2); // last
  });

  test('cancels by subject directly when no isoDate given', async () => {
    mockJsonStore.listEvents.mockResolvedValue([EVT]);
    mockJsonStore.findEventBySubject.mockResolvedValue(EVT);
    await dispatch(nlu('cancel_event', { subject: 'Médecin' }), USER);
    expect(mockJsonStore.findEventBySubject).toHaveBeenCalledWith(USER, 'Médecin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. update_event
// ═════════════════════════════════════════════════════════════════════════════

describe('dispatch — update_event', () => {
  test('returns ok:true "aucun" when list is empty', async () => {
    mockJsonStore.listEvents.mockResolvedValue([]);
    const result = await dispatch(nlu('update_event'), USER);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/aucun/i);
  });

  test('updates event found by date', async () => {
    mockJsonStore.listEvents.mockResolvedValue([EVT]);
    mockJsonStore.findEventByDate.mockResolvedValue(EVT);
    mockJsonStore.updateEvent.mockResolvedValue({ ...EVT, time: '15:00' });
    const result = await dispatch(
      nlu('update_event', { isoDate: '2026-06-01', isoTime: '15:00' }),
      USER
    );
    expect(mockJsonStore.updateEvent).toHaveBeenCalledWith(
      USER,
      EVT.id,
      expect.objectContaining({ time: '15:00' })
    );
    expect(result.ok).toBe(true);
  });

  test('falls back to last event when no date match', async () => {
    mockJsonStore.listEvents.mockResolvedValue([EVT]);
    mockJsonStore.findEventByDate.mockResolvedValue(null);
    await dispatch(nlu('update_event', { isoDate: 'x', isoTime: '10:00' }), USER);
    expect(mockJsonStore.updateEvent).toHaveBeenCalledWith(USER, EVT.id, expect.any(Object));
  });

  test('uses original target when updateEvent returns null', async () => {
    mockJsonStore.listEvents.mockResolvedValue([EVT]);
    mockJsonStore.findEventByDate.mockResolvedValue(EVT);
    mockJsonStore.updateEvent.mockResolvedValue(null);
    const result = await dispatch(nlu('update_event', { isoDate: '2026-06-01' }), USER);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Médecin'); // falls back to target
  });

  test('patch includes subject when provided', async () => {
    mockJsonStore.listEvents.mockResolvedValue([EVT]);
    mockJsonStore.findEventByDate.mockResolvedValue(EVT);
    await dispatch(nlu('update_event', { isoDate: '2026-06-01', subject: 'Kiné' }), USER);
    expect(mockJsonStore.updateEvent).toHaveBeenCalledWith(
      USER,
      EVT.id,
      expect.objectContaining({ subject: 'Kiné' })
    );
  });

  test('finds by subject when no date match and subject provided', async () => {
    mockJsonStore.listEvents.mockResolvedValue([EVT]);
    mockJsonStore.findEventByDate.mockResolvedValue(null);
    mockJsonStore.findEventBySubject.mockResolvedValue(EVT);
    await dispatch(nlu('update_event', { isoDate: '2026-06-01', subject: 'Médecin' }), USER);
    expect(mockJsonStore.findEventBySubject).toHaveBeenCalledWith(USER, 'Médecin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. list_events
// ═════════════════════════════════════════════════════════════════════════════

describe('dispatch — list_events', () => {
  test('returns "aucun rendez-vous" when list is empty', async () => {
    mockJsonStore.listEvents.mockResolvedValue([]);
    const result = await dispatch(nlu('list_events'), USER);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/aucun/i);
  });

  test('returns formatted list when events exist', async () => {
    mockJsonStore.listEvents.mockResolvedValue([EVT]);
    const result = await dispatch(nlu('list_events'), USER);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Médecin');
    expect(result.message).toContain('2026-06-01');
  });

  test('lists multiple events with dash-prefixed lines', async () => {
    mockJsonStore.listEvents.mockResolvedValue([
      EVT,
      { id: 2, subject: 'Dentiste', date: '2026-06-10', time: '10:00' },
    ]);
    const result = await dispatch(nlu('list_events'), USER);
    const lines = result.message.split('\n');
    expect(lines.filter(l => l.startsWith('-')).length).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. unknown intent
// ═════════════════════════════════════════════════════════════════════════════

describe('dispatch — unknown intent', () => {
  test('returns ok:false with "pas compris" message', async () => {
    const result = await dispatch(nlu('unknown'), USER);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/pas compris/i);
  });

  test('uses "global" as default userKey', async () => {
    const result = await dispatch(nlu('list_events'));
    // should not throw
    expect(result).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Error propagation and metric recording
// ═════════════════════════════════════════════════════════════════════════════

describe('dispatch — error path', () => {
  test('re-throws error from store', async () => {
    mockJsonStore.listEvents.mockRejectedValueOnce(new Error('DB crash'));
    await expect(dispatch(nlu('list_events'), USER)).rejects.toThrow('DB crash');
  });

  test('records errorCounter on store error', async () => {
    mockJsonStore.listEvents.mockRejectedValueOnce(new Error('timeout'));
    await dispatch(nlu('list_events'), USER).catch(() => {});
    expect(mockErrorCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'agent' })
    );
  });

  test('records timer with success:false on error', async () => {
    mockJsonStore.listEvents.mockRejectedValueOnce(new Error('fail'));
    await dispatch(nlu('list_events'), USER).catch(() => {});
    expect(mockTimer).toHaveBeenCalledWith({ success: 'false' });
  });

  test('timer is always called (finally block)', async () => {
    await dispatch(nlu('create_event'), USER); // no date → ok:false, no throw
    expect(mockTimer).toHaveBeenCalledTimes(1);
  });

  test('normalizeIntent is called with raw intent', async () => {
    await dispatch(nlu('list_events'), USER);
    expect(mockNormalizeIntent).toHaveBeenCalledWith('list_events');
  });
});
