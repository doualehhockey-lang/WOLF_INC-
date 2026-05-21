// tests/core/featureFlags.test.js
// Unit tests for src/core/featureFlags.js
// Covers: isEnabled, setFlag, killSwitch, restore, getAllFlags, snapshotFlags, clearCache.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Redis mock — controllable per-key store ───────────────────────────────────
const _store = {};

const mockCacheGet = jest.fn(async (key) => _store[key] ?? null);
const mockCacheSet = jest.fn(async (key, value) => { _store[key] = value; return 'OK'; });

jest.unstable_mockModule('../../src/infra/redis/redisClient.js', () => ({
  cacheGet:       mockCacheGet,
  cacheSet:       mockCacheSet,
  cacheDel:       jest.fn(async (key) => { delete _store[key]; return 1; }),
  cacheIncr:      jest.fn(),
  cacheExpire:    jest.fn(),
  cacheGetBuffer: jest.fn(),
  cacheSetBuffer: jest.fn(),
  cacheTtl:       jest.fn(),
  evalScript:     jest.fn(),
  redis:          null,
  redisAvailable: false,
}));

const {
  isEnabled, setFlag, killSwitch, restore,
  getAllFlags, snapshotFlags, clearCache, FLAGS,
} = await import('../../src/core/featureFlags.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function clearStore() {
  Object.keys(_store).forEach(k => delete _store[k]);
}

beforeEach(() => {
  jest.clearAllMocks();
  clearStore();
  clearCache(); // reset in-process cache between tests
});

// ═════════════════════════════════════════════════════════════════════════════
// FLAGS constants
// ═════════════════════════════════════════════════════════════════════════════

describe('FLAGS constants', () => {
  test('FLAGS object is frozen', () => {
    expect(Object.isFrozen(FLAGS)).toBe(true);
  });

  test('FLAGS contains all expected keys', () => {
    const expected = [
      'CLAUDE_NLU', 'OLLAMA_NLU', 'TTS_ELEVENLABS', 'TTS_AZURE', 'TTS_PIPER',
      'PIPELINE_VOICE', 'PIPELINE_SMS', 'MEMORY_CONTEXT', 'RATE_LIMIT',
      'OTEL_TRACES', 'AUDIT_LOG', 'TRANSLATION',
    ];
    for (const key of expected) {
      expect(FLAGS).toHaveProperty(key);
      expect(typeof FLAGS[key]).toBe('string');
    }
  });

  test('each FLAG value is a dot-separated string', () => {
    for (const value of Object.values(FLAGS)) {
      expect(value).toMatch(/^[a-z][a-z0-9.-]+$/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// isEnabled — default behaviour (Redis key absent)
// ═════════════════════════════════════════════════════════════════════════════

describe('isEnabled — defaults when Redis key absent', () => {
  test('all known flags are enabled by default', async () => {
    for (const flagName of Object.values(FLAGS)) {
      clearCache();
      const result = await isEnabled(flagName);
      expect(result).toBe(true);
    }
  });

  test('unknown flag defaults to true (fail open)', async () => {
    expect(await isEnabled('unknown.flag.xyz')).toBe(true);
  });

  test('returns from in-process cache on second call (no Redis hit)', async () => {
    await isEnabled(FLAGS.CLAUDE_NLU);
    const callCount = mockCacheGet.mock.calls.length;
    await isEnabled(FLAGS.CLAUDE_NLU);
    expect(mockCacheGet.mock.calls.length).toBe(callCount); // no extra Redis call
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// isEnabled — Redis values
// ═════════════════════════════════════════════════════════════════════════════

describe('isEnabled — reads from Redis', () => {
  test('"1" in Redis → true', async () => {
    _store['ff:wolf:claude.nlu'] = '1';
    expect(await isEnabled(FLAGS.CLAUDE_NLU)).toBe(true);
  });

  test('"0" in Redis → false (kill switch active)', async () => {
    _store['ff:wolf:claude.nlu'] = '0';
    expect(await isEnabled(FLAGS.CLAUDE_NLU)).toBe(false);
  });

  test('"false" in Redis → false', async () => {
    _store['ff:wolf:tts.elevenlabs'] = 'false';
    expect(await isEnabled(FLAGS.TTS_ELEVENLABS)).toBe(false);
  });

  test('any truthy string (not "0"/"false") → true', async () => {
    _store['ff:wolf:pipeline.voice'] = 'enabled';
    expect(await isEnabled(FLAGS.PIPELINE_VOICE)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// isEnabled — Redis failure (fail open)
// ═════════════════════════════════════════════════════════════════════════════

describe('isEnabled — Redis failure falls back to default', () => {
  test('Redis throws → returns true (default), does not throw', async () => {
    mockCacheGet.mockRejectedValueOnce(new Error('ECONNRESET'));
    const result = await isEnabled(FLAGS.PIPELINE_VOICE);
    expect(result).toBe(true); // default is true
  });

  test('Redis throws → result is cached briefly (avoids thundering herd)', async () => {
    mockCacheGet.mockRejectedValueOnce(new Error('Redis down'));
    await isEnabled(FLAGS.PIPELINE_SMS);
    const calls = mockCacheGet.mock.calls.length;
    await isEnabled(FLAGS.PIPELINE_SMS); // should use cache
    expect(mockCacheGet.mock.calls.length).toBe(calls); // no extra Redis call
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// setFlag
// ═════════════════════════════════════════════════════════════════════════════

describe('setFlag', () => {
  test('setFlag(name, false) writes "0" to Redis', async () => {
    await setFlag(FLAGS.CLAUDE_NLU, false);
    expect(mockCacheSet).toHaveBeenCalledWith(
      'ff:wolf:claude.nlu', '0', expect.any(Number)
    );
  });

  test('setFlag(name, true) writes "1" to Redis', async () => {
    await setFlag(FLAGS.AUDIT_LOG, true);
    expect(mockCacheSet).toHaveBeenCalledWith(
      'ff:wolf:audit.log', '1', expect.any(Number)
    );
  });

  test('setFlag invalidates local cache — next isEnabled reads Redis', async () => {
    // Prime the cache with "true"
    await isEnabled(FLAGS.TRANSLATION);
    const callsBefore = mockCacheGet.mock.calls.length;

    // Set to false (invalidates cache)
    _store['ff:wolf:translation'] = '0';
    await setFlag(FLAGS.TRANSLATION, false);

    // Next isEnabled must hit Redis again
    const result = await isEnabled(FLAGS.TRANSLATION);
    expect(mockCacheGet.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(result).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// killSwitch and restore
// ═════════════════════════════════════════════════════════════════════════════

describe('killSwitch and restore', () => {
  test('killSwitch disables the flag', async () => {
    await killSwitch(FLAGS.RATE_LIMIT);
    expect(mockCacheSet).toHaveBeenCalledWith(
      'ff:wolf:rate-limit', '0', expect.any(Number)
    );
  });

  test('restore re-enables the flag', async () => {
    await restore(FLAGS.RATE_LIMIT);
    expect(mockCacheSet).toHaveBeenCalledWith(
      'ff:wolf:rate-limit', '1', expect.any(Number)
    );
  });

  test('kill then restore → flag is enabled again', async () => {
    await killSwitch(FLAGS.MEMORY_CONTEXT);
    _store['ff:wolf:memory.context'] = '0';

    expect(await isEnabled(FLAGS.MEMORY_CONTEXT)).toBe(false);

    await restore(FLAGS.MEMORY_CONTEXT);
    _store['ff:wolf:memory.context'] = '1';

    expect(await isEnabled(FLAGS.MEMORY_CONTEXT)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getAllFlags
// ═════════════════════════════════════════════════════════════════════════════

describe('getAllFlags', () => {
  test('returns an entry for every known flag', async () => {
    const all = await getAllFlags();
    for (const flagName of Object.values(FLAGS)) {
      // Wrap in array — prevents toHaveProperty from treating dots as nested path
      expect(all).toHaveProperty([flagName]);
    }
  });

  test('each entry has enabled, default, cached, key', async () => {
    const all = await getAllFlags();
    for (const entry of Object.values(all)) {
      expect(typeof entry.enabled).toBe('boolean');
      expect(typeof entry.default).toBe('boolean');
      expect(typeof entry.cached).toBe('boolean');
      expect(typeof entry.key).toBe('string');
    }
  });

  test('reflects Redis values correctly', async () => {
    _store['ff:wolf:claude.nlu'] = '0';
    const all = await getAllFlags();
    expect(all[FLAGS.CLAUDE_NLU].enabled).toBe(false);
    expect(all[FLAGS.CLAUDE_NLU].default).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// snapshotFlags
// ═════════════════════════════════════════════════════════════════════════════

describe('snapshotFlags', () => {
  test('returns a plain object with boolean values for all flags', async () => {
    await getAllFlags(); // warm the cache
    const snap = snapshotFlags();
    expect(typeof snap).toBe('object');
    for (const flagName of Object.values(FLAGS)) {
      expect(typeof snap[flagName]).toBe('boolean');
    }
  });

  test('uses defaults when cache is empty (no Redis calls)', () => {
    clearCache();
    const snap = snapshotFlags();
    // All defaults are true
    for (const value of Object.values(snap)) {
      expect(value).toBe(true);
    }
    // snapshotFlags must NOT call Redis
    expect(mockCacheGet).not.toHaveBeenCalled();
  });

  test('reflects killed flag in snapshot', async () => {
    _store['ff:wolf:otel.traces'] = '0';
    await isEnabled(FLAGS.OTEL_TRACES); // warm cache with false
    const snap = snapshotFlags();
    expect(snap[FLAGS.OTEL_TRACES]).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// clearCache
// ═════════════════════════════════════════════════════════════════════════════

describe('clearCache', () => {
  test('clearCache forces Redis read on next isEnabled', async () => {
    await isEnabled(FLAGS.TTS_PIPER); // prime cache
    const calls = mockCacheGet.mock.calls.length;

    clearCache();

    await isEnabled(FLAGS.TTS_PIPER); // must hit Redis again
    expect(mockCacheGet.mock.calls.length).toBeGreaterThan(calls);
  });
});
