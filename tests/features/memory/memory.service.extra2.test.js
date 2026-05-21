// tests/features/memory/memory.service.extra2.test.js
// Covers memory.service.js:
//   Lines 104,107: buildContext with pendingIntent and pendingSubject set
//   Lines 142-153: getLang (s?.lang ?? 'fr'), clearSession, getStats

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockCacheGet = jest.fn(async () => null);
const mockCacheSet = jest.fn(async () => {});
const mockCacheDel = jest.fn(async () => {});

jest.unstable_mockModule('../../../src/infra/redis/redisClient.js', () => ({
  cacheGet:    mockCacheGet,
  cacheSet:    mockCacheSet,
  cacheDel:    mockCacheDel,
  cacheIncr:   jest.fn(async () => 1),
  cacheExpire: jest.fn(async () => {}),
  cacheTtl:    jest.fn(async () => -1),
}));

jest.unstable_mockModule('../../../src/features/memory/session.schema.js', () => ({
  parseSession:   (s) => s,
  defaultSession: (callSid) => ({
    callSid, turns: [],
    pendingIntent: null, pendingDate: null, pendingTime: null, pendingSubject: null,
    lang: null, lastActivity: Date.now(),
  }),
}));

const {
  addAgentTurn, buildContext, getLang, clearSession, getStats, setLang,
} = await import('../../../src/features/memory/memory.service.js');

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// Lines 104,107: buildContext — pendingIntent + pendingSubject TRUE branches
// ═════════════════════════════════════════════════════════════════════════════

describe('buildContext — pendingIntent and pendingSubject TRUE branches (lines 104,107)', () => {
  test('includes pendingIntent and pendingSubject in context string', async () => {
    const sid = 'ctx-branch-sid';

    // Add an agent turn with intent AND subject so both pending fields are set
    await addAgentTurn(sid, 'Rendez-vous créé', {
      intent:  'create_event',
      isoDate: '2026-09-01',
      isoTime: '10:00',
      subject: 'médecin',
    });

    const ctx = await buildContext(sid);

    // Should contain the pending context section
    expect(ctx).toContain('intent précédent: create_event');   // line 104 TRUE
    expect(ctx).toContain('sujet précédent: médecin');          // line 107 TRUE
    expect(ctx).toContain('date précédente: 2026-09-01');       // line 105 TRUE (bonus)
  });

  test('line 104 FALSE and 107 FALSE: pendingDate set but no pendingIntent or pendingSubject', async () => {
    // Mock cacheGet to return a pre-crafted session: pendingDate set, no intent/subject
    // This triggers the outer if (true), but pendingIntent (false) and pendingSubject (false)
    const fakeSession = JSON.stringify({
      callSid: 'ctx-false-sid', turns: [{ role: 'user', content: 'test' }],
      pendingIntent: null,         // line 104 FALSE branch
      pendingDate:   '2026-10-01', // outer if TRUE (pendingDate truthy)
      pendingTime:   null,
      pendingSubject: null,        // line 107 FALSE branch
      lang: null, lastActivity: Date.now(),
    });
    mockCacheGet.mockResolvedValueOnce(fakeSession);

    const ctx = await buildContext('ctx-false-sid');
    expect(ctx).toContain('date précédente: 2026-10-01'); // pendingDate IS included
    expect(ctx).not.toContain('intent précédent');         // pendingIntent NOT included (FALSE branch)
    expect(ctx).not.toContain('sujet précédent');          // pendingSubject NOT included (FALSE branch)
  });

  test('line 105 FALSE: pendingSubject set but no pendingDate', async () => {
    // Triggers outer if (pendingSubject truthy), but pendingDate is null → line 105 FALSE
    const fakeSession = JSON.stringify({
      callSid: 'ctx-nodate-sid', turns: [{ role: 'user', content: 'test2' }],
      pendingIntent: null,
      pendingDate:   null,         // line 105 FALSE branch (pendingDate falsy)
      pendingTime:   null,
      pendingSubject: 'kiné',      // outer if TRUE (pendingSubject truthy)
      lang: null, lastActivity: Date.now(),
    });
    mockCacheGet.mockResolvedValueOnce(fakeSession);

    const ctx = await buildContext('ctx-nodate-sid');
    expect(ctx).toContain('sujet précédent: kiné');  // pendingSubject IS included
    expect(ctx).not.toContain('date précédente');     // pendingDate NOT included (FALSE branch)
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 142: getLang — s?.lang ?? 'fr' right side (no lang set → 'fr' default)
// ═════════════════════════════════════════════════════════════════════════════

describe('getLang — ?? "fr" right side (line 142)', () => {
  test('returns "fr" when session has no lang set', async () => {
    const lang = await getLang('new-session-lang-sid');
    expect(lang).toBe('fr');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 145-148: clearSession
// ═════════════════════════════════════════════════════════════════════════════

describe('clearSession (lines 145-148)', () => {
  test('deletes session from in-memory store and calls cacheDel', async () => {
    const sid = 'clear-session-sid';

    // First, create a session by adding a turn
    await addAgentTurn(sid, 'Hello', { intent: 'list_events' });

    // Now clear it
    await clearSession(sid);

    // cacheDel should have been called
    expect(mockCacheDel).toHaveBeenCalledWith(expect.stringContaining(sid));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 150-161: getStats
// ═════════════════════════════════════════════════════════════════════════════

describe('getStats (lines 150-161)', () => {
  test('returns activeSessions count and sessions array', async () => {
    const sid = 'stats-session-sid';
    await addAgentTurn(sid, 'Bonjour', { intent: 'list_events' });

    const stats = getStats();

    expect(stats).toHaveProperty('activeSessions');
    expect(typeof stats.activeSessions).toBe('number');
    expect(stats).toHaveProperty('backend');
    expect(Array.isArray(stats.sessions)).toBe(true);

    // The stats session should be in the list
    const s = stats.sessions.find(s => s.callSid.includes(sid.slice(-8)));
    expect(s).toBeDefined();
    expect(s.turns).toBeGreaterThanOrEqual(1);
  });

  test('backend is "memory" when REDIS_URL is absent', async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    const stats = getStats();
    expect(stats.backend).toBe('memory');
    if (saved !== undefined) process.env.REDIS_URL = saved;
  });

  test('backend is "redis" when REDIS_URL is set (line 153 TRUE branch)', async () => {
    // Temporarily set REDIS_URL to trigger the 'redis' branch of the ternary
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://localhost:6379';
    const stats = getStats();
    expect(stats.backend).toBe('redis');
    if (saved !== undefined) process.env.REDIS_URL = saved;
    else delete process.env.REDIS_URL;
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Catch handlers: getLang when _get throws, clearSession when cacheDel throws
// ═════════════════════════════════════════════════════════════════════════════

describe('getLang catch handler — () => null (line 141)', () => {
  test('returns "fr" when _get rejects (catch handler fires)', async () => {
    // Force cacheGet to reject → _get throws → catch fires → returns null → ?? 'fr'
    mockCacheGet.mockRejectedValueOnce(new Error('cache unavailable'));
    const lang = await getLang('getLang-catch-sid');
    expect(lang).toBe('fr');
    // Catch handler () => null was invoked
  });
});

describe('clearSession catch handler — () => {} (line 146)', () => {
  test('does not throw when cacheDel rejects (catch handler fires)', async () => {
    // Force cacheDel to reject → catch fires → swallowed silently
    mockCacheDel.mockRejectedValueOnce(new Error('del failed'));
    await expect(clearSession('clearSession-catch-sid')).resolves.toBeUndefined();
    // Catch handler () => {} was invoked, no error propagated
  });
});
