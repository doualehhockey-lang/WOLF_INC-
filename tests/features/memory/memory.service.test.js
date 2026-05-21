// tests/features/memory/memory.service.test.js
// Conversational session store: CRUD, turn history cap, context building,
// detectShortAnswer, getLastEntities, clearSession, getStats, Redis-failure fallback.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

// ── Mock Redis — simple in-memory Map to simulate both paths ─────────────────
// We expose a mutable `_redisStore` Map and a flag `_failRedis`
// so individual tests can simulate Redis unavailability or errors.
const _redisStore  = new Map();
let   _failRedis   = false;

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  redis: null,
  redisAvailable: false,
  cacheGet: jest.fn(async (key) => {
    if (_failRedis) throw new Error('Redis down');
    return _redisStore.has(key) ? _redisStore.get(key) : null;
  }),
  cacheSet: jest.fn(async (key, value) => {
    if (_failRedis) throw new Error('Redis down');
    _redisStore.set(key, value);
  }),
  cacheDel: jest.fn(async (key) => {
    _redisStore.delete(key);
  }),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { cacheDel: mockCacheDel } = await import('../../../src/infra/redis/redisClient.js');

const {
  getSession,
  addUserTurn,
  addAgentTurn,
  buildContext,
  getLastEntities,
  detectShortAnswer,
  clearSession,
  setLang,
  getLang,
  getStats,
} = await import('../../../src/features/memory/memory.service.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
let _sidCounter = 0;
/** Generate a unique callSid per test to avoid state bleed. */
const sid = () => `CA${String(++_sidCounter).padStart(32, '0')}`;

beforeEach(() => {
  jest.clearAllMocks();
  _redisStore.clear();
  _failRedis = false;
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. getSession
// ═════════════════════════════════════════════════════════════════════════════

describe('getSession', () => {
  test('returns a default session for an unknown callSid', async () => {
    const s = await getSession(sid());
    expect(s.turns).toEqual([]);
    expect(s.lang).toBe('fr');
    expect(s.pendingIntent).toBeNull();
    expect(s.pendingDate).toBeNull();
    expect(s.pendingTime).toBeNull();
    expect(s.pendingSubject).toBeNull();
  });

  test('callSid is preserved in the returned session', async () => {
    const id = sid();
    const s  = await getSession(id);
    expect(s.callSid).toBe(id);
  });

  test('returns previously saved session from memory store', async () => {
    const id = sid();
    await addUserTurn(id, 'premier message');
    const s = await getSession(id);
    expect(s.turns).toHaveLength(1);
    expect(s.turns[0].content).toBe('premier message');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. addUserTurn
// ═════════════════════════════════════════════════════════════════════════════

describe('addUserTurn', () => {
  test('appends a user turn with role "user"', async () => {
    const id = sid();
    await addUserTurn(id, 'hello');
    const s = await getSession(id);
    expect(s.turns[0].role).toBe('user');
    expect(s.turns[0].content).toBe('hello');
  });

  test('turn includes a numeric timestamp', async () => {
    const id = sid();
    await addUserTurn(id, 'ts test');
    const s = await getSession(id);
    expect(typeof s.turns[0].ts).toBe('number');
    expect(s.turns[0].ts).toBeGreaterThan(0);
  });

  test('multiple user turns accumulate in order', async () => {
    const id = sid();
    await addUserTurn(id, 'first');
    await addUserTurn(id, 'second');
    await addUserTurn(id, 'third');
    const s = await getSession(id);
    expect(s.turns).toHaveLength(3);
    expect(s.turns.map(t => t.content)).toEqual(['first', 'second', 'third']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. addAgentTurn
// ═════════════════════════════════════════════════════════════════════════════

describe('addAgentTurn', () => {
  test('appends an agent turn with role "agent"', async () => {
    const id = sid();
    await addAgentTurn(id, 'Bien sûr', { intent: 'list_events' });
    const s = await getSession(id);
    expect(s.turns[0].role).toBe('agent');
    expect(s.turns[0].content).toBe('Bien sûr');
  });

  test('saves pendingIntent when intent is known', async () => {
    const id = sid();
    await addAgentTurn(id, 'Votre rendez-vous est créé', { intent: 'create_event', isoDate: '2026-06-01', subject: 'médecin' });
    const s = await getSession(id);
    expect(s.pendingIntent).toBe('create_event');
    expect(s.pendingDate).toBe('2026-06-01');
    expect(s.pendingSubject).toBe('médecin');
  });

  test('does not overwrite pendingIntent when intent is "unknown"', async () => {
    const id = sid();
    await addAgentTurn(id, 'First', { intent: 'create_event' });
    await addAgentTurn(id, 'Unknown', { intent: 'unknown' });
    const s = await getSession(id);
    expect(s.pendingIntent).toBe('create_event'); // preserved
  });

  test('preserves existing pendingDate when new agent turn has no date', async () => {
    const id = sid();
    await addAgentTurn(id, 'First', { intent: 'create_event', isoDate: '2026-07-04' });
    await addAgentTurn(id, 'Second', { intent: 'create_event', isoDate: undefined });
    const s = await getSession(id);
    expect(s.pendingDate).toBe('2026-07-04');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Turn history cap (MAX_TURNS = 6)
// ═════════════════════════════════════════════════════════════════════════════

describe('Turn history cap (MAX_TURNS = 6)', () => {
  test('keeps at most 6 turns, discarding oldest', async () => {
    const id = sid();
    for (let i = 1; i <= 8; i++) {
      await addUserTurn(id, `message ${i}`);
    }
    const s = await getSession(id);
    expect(s.turns).toHaveLength(6);
    // Most recent 6 turns should remain
    expect(s.turns[0].content).toBe('message 3');
    expect(s.turns[5].content).toBe('message 8');
  });

  test('adding exactly 6 turns keeps all 6', async () => {
    const id = sid();
    for (let i = 1; i <= 6; i++) await addUserTurn(id, `turn ${i}`);
    const s = await getSession(id);
    expect(s.turns).toHaveLength(6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. buildContext
// ═════════════════════════════════════════════════════════════════════════════

describe('buildContext', () => {
  test('returns empty string for a session with no turns', async () => {
    const id = sid();
    const ctx = await buildContext(id);
    expect(ctx).toBe('');
  });

  test('formats user turns as [UTILISATEUR]', async () => {
    const id = sid();
    await addUserTurn(id, 'bonjour');
    const ctx = await buildContext(id);
    expect(ctx).toContain('[UTILISATEUR]: bonjour');
  });

  test('formats agent turns as [AGENT]', async () => {
    const id = sid();
    await addAgentTurn(id, 'Bonsoir', {});
    const ctx = await buildContext(id);
    expect(ctx).toContain('[AGENT]: Bonsoir');
  });

  test('includes pending context when pendingDate or pendingSubject is set', async () => {
    const id = sid();
    await addAgentTurn(id, 'Ok', { intent: 'create_event', isoDate: '2026-10-01', subject: 'dentiste' });
    const ctx = await buildContext(id);
    expect(ctx).toContain('date précédente: 2026-10-01');
    expect(ctx).toContain('sujet précédent: dentiste');
  });

  test('does not include pending context when no pending data', async () => {
    const id = sid();
    await addUserTurn(id, 'just a turn');
    const ctx = await buildContext(id);
    expect(ctx).not.toContain('Contexte actif');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. getLastEntities
// ═════════════════════════════════════════════════════════════════════════════

describe('getLastEntities', () => {
  test('returns null when no pending intent', async () => {
    const id = sid();
    const result = await getLastEntities(id);
    expect(result).toBeNull();
  });

  test('returns intent/date/time/subject after addAgentTurn with known intent', async () => {
    const id = sid();
    await addAgentTurn(id, 'message', {
      intent: 'cancel_event',
      isoDate: '2026-05-20',
      isoTime: '14:00',
      subject: 'réunion',
    });
    const ents = await getLastEntities(id);
    expect(ents.intent).toBe('cancel_event');
    expect(ents.isoDate).toBe('2026-05-20');
    expect(ents.isoTime).toBe('14:00');
    expect(ents.subject).toBe('réunion');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. detectShortAnswer
// ═════════════════════════════════════════════════════════════════════════════

describe('detectShortAnswer', () => {
  const YES_INPUTS = ['oui', 'yes', 'ok', 'ouais', 'bien sur', 'parfait', 'confirme', 'valide', "d'accord", 'dac', 'exactement'];
  const NO_INPUTS  = ['non', 'no', 'nan', 'pas du tout', 'annule', 'laisse tomber', 'jamais'];

  test.each(YES_INPUTS)('"%s" → "confirm"', (input) => {
    expect(detectShortAnswer(input)).toBe('confirm');
  });

  test.each(NO_INPUTS)('"%s" → "deny"', (input) => {
    expect(detectShortAnswer(input)).toBe('deny');
  });

  test('returns null for unrecognized input', () => {
    expect(detectShortAnswer('peut-être')).toBeNull();
    expect(detectShortAnswer('je ne sais pas')).toBeNull();
    expect(detectShortAnswer('rendez-vous demain')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(detectShortAnswer('')).toBeNull();
  });

  test('returns null for null', () => {
    expect(detectShortAnswer(null)).toBeNull();
  });

  test('handles uppercase — lowercased before matching so "OUI" → confirm', () => {
    // The function does text.toLowerCase() so 'OUI' → 'oui' → matches YES list
    expect(detectShortAnswer('OUI')).toBe('confirm');
    expect(detectShortAnswer('oui')).toBe('confirm');
  });

  test('prefix match — "oui merci" → confirm', () => {
    expect(detectShortAnswer('oui merci')).toBe('confirm');
  });

  test('prefix match — "non merci" → deny', () => {
    expect(detectShortAnswer('non merci')).toBe('deny');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. setLang / getLang
// ═════════════════════════════════════════════════════════════════════════════

describe('setLang / getLang', () => {
  test('getLang returns "fr" by default', async () => {
    const id = sid();
    expect(await getLang(id)).toBe('fr');
  });

  test('setLang persists; getLang returns new value', async () => {
    const id = sid();
    await setLang(id, 'en');
    expect(await getLang(id)).toBe('en');
  });

  test('different sessions have independent language settings', async () => {
    const id1 = sid();
    const id2 = sid();
    await setLang(id1, 'en');
    await setLang(id2, 'es');
    expect(await getLang(id1)).toBe('en');
    expect(await getLang(id2)).toBe('es');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. clearSession
// ═════════════════════════════════════════════════════════════════════════════

describe('clearSession', () => {
  test('removes session from in-memory store', async () => {
    const id = sid();
    await addUserTurn(id, 'before clear');
    await clearSession(id);
    const s = await getSession(id);
    expect(s.turns).toHaveLength(0); // default fresh session
  });

  test('does not throw when clearing a non-existent session', async () => {
    await expect(clearSession(sid())).resolves.not.toThrow();
  });

  test('cacheDel().catch(() => {}) fires when cacheDel rejects (line 146)', async () => {
    // Override cacheDel to reject once → catch handler swallows it silently
    mockCacheDel.mockRejectedValueOnce(new Error('del failed'));
    await expect(clearSession(sid())).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. getStats
// ═════════════════════════════════════════════════════════════════════════════

describe('getStats', () => {
  test('returns activeSessions count', async () => {
    const id = sid();
    await addUserTurn(id, 'stat test');
    const stats = getStats();
    expect(typeof stats.activeSessions).toBe('number');
    expect(stats.activeSessions).toBeGreaterThan(0);
  });

  test('returns backend field', () => {
    const stats = getStats();
    expect(['redis', 'memory']).toContain(stats.backend);
  });

  test('sessions array has one entry per active session', async () => {
    const id = sid();
    await addUserTurn(id, 'sessions array test');
    const stats = getStats();
    const entry = stats.sessions.find(s => s.callSid === id.slice(-8));
    expect(entry).toBeDefined();
    expect(typeof entry.turns).toBe('number');
    expect(typeof entry.lastActivity).toBe('string');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Redis failure — silent fallback to in-memory
// ═════════════════════════════════════════════════════════════════════════════

describe('Redis failure — silent fallback', () => {
  test('addUserTurn succeeds even when Redis save throws', async () => {
    _failRedis = true;
    const id = sid();
    // Should not throw — logs warn and writes to memory only
    await expect(addUserTurn(id, 'redis fail test')).resolves.not.toThrow();
  });

  test('session is readable from in-memory store after Redis failure', async () => {
    _failRedis = true;
    const id = sid();
    await addUserTurn(id, 'in-memory after redis fail');
    const s = await getSession(id);
    // Reads from _store (in-memory) since Redis is "down"
    expect(s.turns).toHaveLength(1);
    expect(s.turns[0].content).toBe('in-memory after redis fail');
  });
});
