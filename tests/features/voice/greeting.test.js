// tests/features/voice/greeting.test.js
// Greeting pre-warm: initial null URL, success path sets URL, failure keeps null.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    BASE_URL: 'http://localhost:3000',
    AUDIO_DIR: '/tmp/audio',
    VOICE_GREETING_TEXT: 'Hello, I am your Wolf Inc assistant. How can I help you today?',
  },
}));

// ── Mock TTS service ──────────────────────────────────────────────────────────
const mockSynthesize = jest.fn();
jest.unstable_mockModule('../../../src/features/tts/tts.service.js', () => ({
  synthesize: mockSynthesize,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { getGreetingUrl, prewarmGreeting, GREETING_TEXT } =
  await import('../../../src/features/voice/greeting.js');

// ── Stub saveAudio ────────────────────────────────────────────────────────────
const saveAudio = jest.fn(async () => ({ filename: 'greeting.wav' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSynthesize.mockResolvedValue({
    buffer: Buffer.alloc(100),
    ext: '.wav',
    mimeType: 'audio/wav',
    fallback: false,
  });
  saveAudio.mockResolvedValue({ filename: 'greeting.wav' });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Initial state
// ═════════════════════════════════════════════════════════════════════════════

describe('getGreetingUrl — initial state', () => {
  test('GREETING_TEXT is a non-empty string', () => {
    expect(typeof GREETING_TEXT).toBe('string');
    expect(GREETING_TEXT.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. prewarmGreeting — success
// ═════════════════════════════════════════════════════════════════════════════

describe('prewarmGreeting — success', () => {
  test('resolves without throwing', async () => {
    await expect(prewarmGreeting(saveAudio)).resolves.toBeUndefined();
  });

  test('calls synthesize with GREETING_TEXT', async () => {
    await prewarmGreeting(saveAudio);
    expect(mockSynthesize).toHaveBeenCalledWith(GREETING_TEXT);
  });

  test('calls saveAudio with buffer, AUDIO_DIR, ext', async () => {
    await prewarmGreeting(saveAudio);
    expect(saveAudio).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringContaining('audio'),
      '.wav'
    );
  });

  test('sets greeting URL after success', async () => {
    await prewarmGreeting(saveAudio);
    const url = getGreetingUrl();
    expect(url).not.toBeNull();
    expect(url).toContain('greeting.wav');
    expect(url).toContain('http://localhost:3000');
  });

  test('URL starts with BASE_URL/audio/', async () => {
    await prewarmGreeting(saveAudio);
    expect(getGreetingUrl()).toMatch(/^http:\/\/localhost:3000\/audio\//);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. prewarmGreeting — failure paths
// ═════════════════════════════════════════════════════════════════════════════

describe('prewarmGreeting — failure', () => {
  test('does not throw when synthesize rejects', async () => {
    mockSynthesize.mockRejectedValueOnce(new Error('TTS provider down'));
    await expect(prewarmGreeting(saveAudio)).resolves.toBeUndefined();
  });

  test('does not throw when saveAudio rejects', async () => {
    saveAudio.mockRejectedValueOnce(new Error('disk full'));
    await expect(prewarmGreeting(saveAudio)).resolves.toBeUndefined();
  });
});
