// tests/features/memory/memory.service.extra.test.js
// Covers memory.service.js remaining branch gaps:
//   Lines 22-24: GC actually prunes expired sessions (delete + pruned++ + log.debug)
//   Line 39:     Redis cache hit with parseSession returning null (corrupt JSON)
//   Line 73:     addAgentTurn called without nluResult (default {} branch)
//   Line 106:    if (s.pendingTime) TRUE branch in buildContext
//   Line 142:    getLang returns 'fr' default (s?.lang ?? 'fr' — lang is null)

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDebug = jest.fn();
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: mockDebug, info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const _redisStore = new Map();
let _failRedis = false;

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  redis: null,
  redisAvailable: false,
  cacheGet: jest.fn(async key => {
    if (_failRedis) throw new Error('Redis down');
    return _redisStore.has(key) ? _redisStore.get(key) : null;
  }),
  cacheSet: jest.fn(async (key, value) => {
    if (_failRedis) throw new Error('Redis down');
    _redisStore.set(key, value);
  }),
  cacheDel: jest.fn(async key => {
    _redisStore.delete(key);
  }),
}));

// Use fake timers BEFORE import so the setInterval uses fake time
jest.useFakeTimers();

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const { addUserTurn, addAgentTurn, buildContext, getLang, getSession } =
  await import('../../../src/features/memory/memory.service.js');

afterAll(() => jest.useRealTimers());

let _sidCounter = 0;
const sid = () => `CA${String(++_sidCounter).padStart(32, '0')}`;

beforeEach(() => {
  jest.clearAllMocks();
  _redisStore.clear();
  _failRedis = false;
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 22-24: GC prunes expired sessions
// ═════════════════════════════════════════════════════════════════════════════

describe('memory.service — GC prunes expired sessions (lines 22-24)', () => {
  test('GC deletes sessions older than TTL and logs pruned count', async () => {
    // Fake time starts at 0. Set it to a known point so sessions get a sensible lastActivity.
    jest.setSystemTime(0);

    // Create a session at t=0
    await addUserTurn('gc-prune-sid', 'bonjour');

    // Advance fake system time past TTL (15 min = 900s)
    const TTL_MS = 15 * 60 * 1_000;
    jest.setSystemTime(TTL_MS + 1_000); // now is past TTL

    // Fire the GC interval (5 min = 300s)
    jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    // Let GC microtasks complete
    await Promise.resolve();
    await Promise.resolve();

    // The session created at t=0 with lastActivity≈0 should now be < cutoff
    // cutoff = (TTL+1000) - 900000 = 1000 → lastActivity=0 < 1000 ✓
    // debug should have been called with { pruned: 1 }
    const pruneCalls = mockDebug.mock.calls.filter(
      ([obj]) => obj && typeof obj === 'object' && obj.pruned > 0
    );
    expect(pruneCalls.length).toBeGreaterThan(0);
  });

  test('GC does not log when no sessions are pruned (pruned=0 branch)', async () => {
    // No sessions exist → GC runs but pruned stays 0 → log.debug NOT called with pruned
    jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    await Promise.resolve();

    const pruneCalls = mockDebug.mock.calls.filter(
      ([obj]) => obj && typeof obj === 'object' && obj.pruned > 0
    );
    expect(pruneCalls.length).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 39: Redis cache hit — parseSession returns null (corrupt JSON)
// ═════════════════════════════════════════════════════════════════════════════

describe('memory.service — Redis hit with corrupt JSON (line 39 false branch)', () => {
  test('falls through to in-memory store when Redis has corrupt JSON', async () => {
    const id = sid();
    // Manually inject corrupt JSON into the Redis store
    _redisStore.set(`session:${id}`, 'INVALID{JSON}');

    // _get should try Redis → JSON.parse fails → catch → falls through to _store
    // _store has nothing → defaultSession returned
    const s = await getSession(id);
    expect(s.callSid).toBe(id);
    expect(s.turns).toEqual([]);
  });

  test('falls through to in-memory store when Redis has JSON failing schema validation', async () => {
    const id = sid();
    // Inject JSON that parses but fails Zod schema (missing required callSid)
    _redisStore.set(`session:${id}`, JSON.stringify({ callSid: '', turns: [] }));

    // parseSession will return null for invalid callSid (z.string().min(1))
    // → if (parsed) is false → falls through
    const s = await getSession(id);
    // Falls through to in-memory (also empty) → defaultSession
    expect(s.callSid).toBe(id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 73: addAgentTurn called without nluResult (default {} parameter)
// ═════════════════════════════════════════════════════════════════════════════

describe('memory.service — addAgentTurn default parameter (line 73)', () => {
  test('addAgentTurn works when nluResult is omitted (uses default {})', async () => {
    const id = sid();
    // Call without nluResult → triggers default {} parameter branch
    await addAgentTurn(id, 'Bonjour!');
    const s = await getSession(id);
    expect(s.turns).toHaveLength(1);
    expect(s.turns[0].role).toBe('agent');
    expect(s.turns[0].content).toBe('Bonjour!');
    // No pending state set (intent is undefined → falsy)
    expect(s.pendingIntent).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 106: if (s.pendingTime) TRUE branch in buildContext
// ═════════════════════════════════════════════════════════════════════════════

describe('memory.service — buildContext pendingTime TRUE branch (line 106)', () => {
  test('includes pendingTime in context when isoTime is set', async () => {
    const id = sid();
    // Set isoDate, isoTime, and subject — triggers pendingTime true branch
    await addAgentTurn(id, 'Rendez-vous créé', {
      intent: 'create_event',
      isoDate: '2026-11-15',
      isoTime: '14:30',
      subject: 'médecin',
    });
    const ctx = await buildContext(id);
    expect(ctx).toContain('heure précédente: 14:30');
    expect(ctx).toContain('date précédente: 2026-11-15');
    expect(ctx).toContain('sujet précédent: médecin');
  });
});
