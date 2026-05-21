// tests/services/audio.utils.cleanup.test.js
// Covers lines 11-24: the setInterval auto-purge callback.
// Uses jest.useFakeTimers() to advance time and trigger the interval.

import { jest } from '@jest/globals';

// ── Mock fs/promises ──────────────────────────────────────────────────────────
const mockReaddir = jest.fn(async () => []);
const mockStat    = jest.fn(async () => null);
const mockUnlink  = jest.fn(async () => {});
const mockWriteFile = jest.fn(async () => {});
const mockMkdir   = jest.fn(async () => {});

jest.unstable_mockModule('fs/promises', () => ({
  readdir:   mockReaddir,
  stat:      mockStat,
  unlink:    mockUnlink,
  writeFile: mockWriteFile,
  mkdir:     mockMkdir,
}));

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: {
    AUDIO_DIR:   '/tmp/audio-test',
    BASE_URL:    'http://localhost:3000',
    PHONE_SALT:  'testsalt1234567890',
    JWT_SECRET:  'testjwtsecret1234567890testjwtsecret1234567890',
    JWT_REFRESH_SECRET: 'testrefreshsecret1234567890testrefreshsecret',
    API_KEYS:    ['test-key'],
  },
}));

// ── Use fake timers BEFORE import ─────────────────────────────────────────────
jest.useFakeTimers();

await import('../../src/services/audio.utils.js');

afterAll(() => {
  jest.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════════════════
// setInterval cleanup callback — lines 11-24
// ═════════════════════════════════════════════════════════════════════════════

describe('audio.utils — auto-purge setInterval (lines 11-24)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('callback runs when interval fires with empty dir', async () => {
    mockReaddir.mockResolvedValueOnce([]);

    jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    await Promise.resolve(); // flush microtasks

    expect(mockReaddir).toHaveBeenCalledWith('/tmp/audio-test');
  });

  test('callback deletes files older than 10 minutes', async () => {
    const TTS_MAX_AGE_MS = 10 * 60 * 1_000;
    const now = Date.now();
    mockReaddir.mockResolvedValueOnce(['old.mp3', 'new.mp3']);
    mockStat.mockImplementation(async (fp) => ({
      mtimeMs: fp.includes('old') ? now - TTS_MAX_AGE_MS - 1_000 : now - 1_000,
    }));

    jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    // Wait for the async callback to complete
    await new Promise(resolve => jest.advanceTimersByTime(0) || resolve());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // old.mp3 should be unlinked; new.mp3 should not
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/audio-test/old.mp3');
    expect(mockUnlink).not.toHaveBeenCalledWith('/tmp/audio-test/new.mp3');
  });

  test('callback does not throw when readdir fails', async () => {
    mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));

    expect(() => {
      jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    }).not.toThrow();

    await Promise.resolve();
  });

  test('callback does not throw when stat fails for a file', async () => {
    mockReaddir.mockResolvedValueOnce(['mystery.mp3']);
    mockStat.mockRejectedValueOnce(new Error('ENOENT'));

    jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    await Promise.resolve();
    await Promise.resolve();
  });

  test('unlink().catch(() => {}) fires when unlink fails on old file (line 20)', async () => {
    // Trigger the catch handler () => {} inside unlink(fp).catch(() => {})
    const TTS_MAX_AGE_MS = 10 * 60 * 1_000;
    const now = Date.now();
    mockReaddir.mockResolvedValueOnce(['old-fail.mp3']);
    mockStat.mockResolvedValueOnce({ mtimeMs: now - TTS_MAX_AGE_MS - 1_000 });
    // unlink rejects → catch(() => {}) is invoked, error is swallowed
    mockUnlink.mockRejectedValueOnce(new Error('EPERM'));

    jest.advanceTimersByTime(5 * 60 * 1_000 + 1);
    // Flush the async map callback
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // No throw — catch handler silently swallowed the unlink error
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/audio-test/old-fail.mp3');
  });
});
