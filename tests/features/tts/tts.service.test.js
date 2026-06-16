// tests/features/tts/tts.service.test.js
// TTS service orchestrator: provider selection, cache integration, inflight dedup,
// mock fallback on provider failure, metric recording.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({
<<<<<<< HEAD
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
=======
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  }),
}));

// ── Mock config — mutable object so tests can switch TTS_PROVIDER ─────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    TTS_PROVIDER: 'mock',
<<<<<<< HEAD
    BASE_URL: 'http://localhost:3000',
    AUDIO_DIR: '/tmp/audio',
=======
    BASE_URL:     'http://localhost:3000',
    AUDIO_DIR:    '/tmp/audio',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  },
}));

// ── Mock metrics ──────────────────────────────────────────────────────────────
const mockTimer = jest.fn(); // returned by startTimer
jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
<<<<<<< HEAD
  ttsLatency: { startTimer: jest.fn(() => mockTimer) },
  inflightTts: { set: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
=======
  ttsLatency:  { startTimer: jest.fn(() => mockTimer) },
  inflightTts: { set: jest.fn() },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Mock errors (import real class — no mock needed) ─────────────────────────
// TtsError is a real class imported by the SUT; we let it through.

// ── Mock TTS cache ────────────────────────────────────────────────────────────
const mockCacheGet = jest.fn(async () => null); // default: cache miss
const mockCacheSet = jest.fn(async () => {});
jest.unstable_mockModule('../../../src/features/tts/tts.cache.js', () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
}));

// ── Mock providers ────────────────────────────────────────────────────────────
<<<<<<< HEAD
const mockSynthesizeMock = jest.fn(async () => Buffer.alloc(44, 0x00));
const mockSynthesizePiper = jest.fn(async () => Buffer.alloc(44, 0x01));
const mockSynthesizeElevenLabs = jest.fn(async () => Buffer.alloc(48, 0x02));
const mockSynthesizeAzure = jest.fn(async () => Buffer.alloc(48, 0x03));
=======
const mockSynthesizeMock      = jest.fn(async () => Buffer.alloc(44, 0x00));
const mockSynthesizePiper     = jest.fn(async () => Buffer.alloc(44, 0x01));
const mockSynthesizeElevenLabs = jest.fn(async () => Buffer.alloc(48, 0x02));
const mockSynthesizeAzure     = jest.fn(async () => Buffer.alloc(48, 0x03));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

jest.unstable_mockModule('../../../src/features/tts/providers/mock.js', () => ({
  synthesizeMock: mockSynthesizeMock,
}));
jest.unstable_mockModule('../../../src/features/tts/providers/piper.js', () => ({
  synthesizePiper: mockSynthesizePiper,
}));
jest.unstable_mockModule('../../../src/features/tts/providers/elevenlabs.js', () => ({
  synthesizeElevenLabs: mockSynthesizeElevenLabs,
}));
jest.unstable_mockModule('../../../src/features/tts/providers/azure.js', () => ({
  synthesizeAzure: mockSynthesizeAzure,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
<<<<<<< HEAD
const { synthesize } = await import('../../../src/features/tts/tts.service.js');
const { config } = await import('../../../src/core/config.js');
const { TtsError } = await import('../../../src/core/errors.js');
const metrics = await import('../../../src/core/metrics.js');
=======
const { synthesize }    = await import('../../../src/features/tts/tts.service.js');
const { config }        = await import('../../../src/core/config.js');
const { TtsError }      = await import('../../../src/core/errors.js');
const metrics           = await import('../../../src/core/metrics.js');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

// ── Reset ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockReset();
  mockCacheGet.mockResolvedValue(null); // default: cache miss
  mockCacheSet.mockReset();
  mockSynthesizeMock.mockReset();
  mockSynthesizeMock.mockResolvedValue(Buffer.alloc(44, 0x00));
  mockSynthesizePiper.mockReset();
  mockSynthesizeElevenLabs.mockReset();
  mockSynthesizeAzure.mockReset();
  mockTimer.mockReset();
  config.TTS_PROVIDER = 'mock'; // default
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Input validation
// ═════════════════════════════════════════════════════════════════════════════

describe('Input validation', () => {
  test('throws TtsError for empty string', async () => {
    await expect(synthesize('')).rejects.toBeInstanceOf(TtsError);
  });

  test('throws TtsError for whitespace-only string', async () => {
    await expect(synthesize('   ')).rejects.toBeInstanceOf(TtsError);
  });

  test('throws TtsError for null', async () => {
    await expect(synthesize(null)).rejects.toBeInstanceOf(TtsError);
  });

  test('throws TtsError for undefined', async () => {
    await expect(synthesize(undefined)).rejects.toBeInstanceOf(TtsError);
  });

  test('does not throw for non-empty text', async () => {
    await expect(synthesize('Bonjour')).resolves.toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Cache hit — no provider called
// ═════════════════════════════════════════════════════════════════════════════

describe('Cache hit', () => {
  test('returns cached result without calling provider', async () => {
<<<<<<< HEAD
    const cachedBuf = Buffer.alloc(20, 0xff);
=======
    const cachedBuf = Buffer.alloc(20, 0xFF);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    mockCacheGet.mockResolvedValueOnce({ buffer: cachedBuf, ext: '.wav', mimeType: 'audio/wav' });
    const result = await synthesize('Cached text');
    expect(result.buffer).toBe(cachedBuf);
    expect(result.ext).toBe('.wav');
    expect(mockSynthesizeMock).not.toHaveBeenCalled();
  });

  test('sets fallback:false on cache hit', async () => {
<<<<<<< HEAD
    mockCacheGet.mockResolvedValueOnce({
      buffer: Buffer.alloc(10),
      ext: '.wav',
      mimeType: 'audio/wav',
    });
=======
    mockCacheGet.mockResolvedValueOnce({ buffer: Buffer.alloc(10), ext: '.wav', mimeType: 'audio/wav' });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const result = await synthesize('Cache fallback false');
    expect(result.fallback).toBe(false);
  });

  test('does not write to cache on a cache hit', async () => {
<<<<<<< HEAD
    mockCacheGet.mockResolvedValueOnce({
      buffer: Buffer.alloc(10),
      ext: '.wav',
      mimeType: 'audio/wav',
    });
=======
    mockCacheGet.mockResolvedValueOnce({ buffer: Buffer.alloc(10), ext: '.wav', mimeType: 'audio/wav' });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await synthesize('Cache no rewrite');
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Provider selection — mock
// ═════════════════════════════════════════════════════════════════════════════

describe('Provider: mock', () => {
  test('returns .wav result when provider is "mock"', async () => {
    const result = await synthesize('Bonjour mock');
    expect(result.ext).toBe('.wav');
    expect(result.mimeType).toBe('audio/wav');
    expect(result.fallback).toBe(false);
    expect(mockSynthesizeMock).toHaveBeenCalledWith('Bonjour mock');
  });

  test('writes result to cache after successful synthesis', async () => {
    await synthesize('Cache write mock');
    expect(mockCacheSet).toHaveBeenCalledTimes(1);
    const [text, provider] = mockCacheSet.mock.calls[0];
    expect(text).toBe('Cache write mock');
    expect(provider).toBe('mock');
  });

  test('records timer with success:true', async () => {
    await synthesize('Timer mock');
    expect(mockTimer).toHaveBeenCalledWith({ success: 'true' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Provider selection — piper
// ═════════════════════════════════════════════════════════════════════════════

describe('Provider: piper', () => {
<<<<<<< HEAD
  beforeEach(() => {
    config.TTS_PROVIDER = 'piper';
  });
=======
  beforeEach(() => { config.TTS_PROVIDER = 'piper'; });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  test('calls synthesizePiper and returns .wav result', async () => {
    mockSynthesizePiper.mockResolvedValueOnce(Buffer.alloc(44, 0x01));
    const result = await synthesize('Piper text');
    expect(result.ext).toBe('.wav');
    expect(result.mimeType).toBe('audio/wav');
    expect(mockSynthesizePiper).toHaveBeenCalledWith('Piper text');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Provider selection — elevenlabs
// ═════════════════════════════════════════════════════════════════════════════

describe('Provider: elevenlabs', () => {
<<<<<<< HEAD
  beforeEach(() => {
    config.TTS_PROVIDER = 'elevenlabs';
  });
=======
  beforeEach(() => { config.TTS_PROVIDER = 'elevenlabs'; });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  test('calls synthesizeElevenLabs and returns .mp3 result', async () => {
    mockSynthesizeElevenLabs.mockResolvedValueOnce(Buffer.alloc(48, 0x02));
    const result = await synthesize('ElevenLabs text');
    expect(result.ext).toBe('.mp3');
    expect(result.mimeType).toBe('audio/mpeg');
    expect(mockSynthesizeElevenLabs).toHaveBeenCalledWith('ElevenLabs text');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Provider selection — azure
// ═════════════════════════════════════════════════════════════════════════════

describe('Provider: azure', () => {
<<<<<<< HEAD
  beforeEach(() => {
    config.TTS_PROVIDER = 'azure';
  });
=======
  beforeEach(() => { config.TTS_PROVIDER = 'azure'; });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  test('calls synthesizeAzure and returns .mp3 result', async () => {
    mockSynthesizeAzure.mockResolvedValueOnce(Buffer.alloc(48, 0x03));
    const result = await synthesize('Azure text', 'en-US');
    expect(result.ext).toBe('.mp3');
    expect(result.mimeType).toBe('audio/mpeg');
    expect(mockSynthesizeAzure).toHaveBeenCalledWith('Azure text', 'en-US');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Mock fallback on provider failure
// ═════════════════════════════════════════════════════════════════════════════

describe('Mock fallback on provider failure', () => {
  test('falls back to mock when elevenlabs throws', async () => {
    config.TTS_PROVIDER = 'elevenlabs';
    mockSynthesizeElevenLabs.mockRejectedValueOnce(new Error('API down'));
    mockSynthesizeMock.mockResolvedValueOnce(Buffer.alloc(44, 0x00));
    const result = await synthesize('Fallback text');
    expect(result.fallback).toBe(true);
    expect(result.ext).toBe('.wav');
    expect(mockSynthesizeMock).toHaveBeenCalled();
  });

  test('falls back to mock when azure throws', async () => {
    config.TTS_PROVIDER = 'azure';
    mockSynthesizeAzure.mockRejectedValueOnce(new Error('Connection refused'));
    mockSynthesizeMock.mockResolvedValueOnce(Buffer.alloc(44, 0x00));
    const result = await synthesize('Azure fallback');
    expect(result.fallback).toBe(true);
    expect(result.ext).toBe('.wav');
  });

  test('records timer with success:false when primary provider fails', async () => {
    config.TTS_PROVIDER = 'elevenlabs';
    mockSynthesizeElevenLabs.mockRejectedValueOnce(new Error('Timeout'));
    mockSynthesizeMock.mockResolvedValueOnce(Buffer.alloc(44, 0x00));
    await synthesize('Timer fail');
    expect(mockTimer).toHaveBeenCalledWith({ success: 'false' });
  });

  test('rethrows when mock itself fails (no double-fallback)', async () => {
    config.TTS_PROVIDER = 'mock';
    mockSynthesizeMock.mockRejectedValueOnce(new Error('Mock broken'));
    await expect(synthesize('Double fail')).rejects.toThrow('Mock broken');
  });

  test('does not cache result when primary provider fails', async () => {
    config.TTS_PROVIDER = 'elevenlabs';
    mockSynthesizeElevenLabs.mockRejectedValueOnce(new Error('Fail'));
    mockSynthesizeMock.mockResolvedValueOnce(Buffer.alloc(44, 0x00));
    await synthesize('No cache on fallback');
    // cacheSet should NOT be called when fallback was used
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Inflight deduplication
// ═════════════════════════════════════════════════════════════════════════════

describe('Inflight deduplication', () => {
  test('two concurrent calls with same text+locale share a single provider call', async () => {
    let resolveProvider;
    mockSynthesizeMock.mockImplementationOnce(
<<<<<<< HEAD
      () =>
        new Promise(r => {
          resolveProvider = () => r(Buffer.alloc(44, 0x00));
        })
=======
      () => new Promise(r => { resolveProvider = () => r(Buffer.alloc(44, 0x00)); }),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );

    const p1 = synthesize('Dedup text');
    const p2 = synthesize('Dedup text'); // same key → should reuse p1's promise

    // Flush microtasks: cacheGet resolves → _synthesize called → synthesizeMock called
    // → resolveProvider assigned inside the Promise constructor (synchronously)
    await new Promise(r => setTimeout(r, 0));

    resolveProvider(); // now defined
    const [r1, r2] = await Promise.all([p1, p2]);

    // Provider called only once
    expect(mockSynthesizeMock).toHaveBeenCalledTimes(1);
    // Both results point to the same data
    expect(r1.ext).toBe(r2.ext);
  });

  test('inflight counter set to 0 after all promises resolve', async () => {
    await synthesize('Inflight counter');
    const { inflightTts } = await import('../../../src/core/metrics.js');
    // Last call to inflightTts.set should be with 0 (cleanup in finally block)
    const calls = inflightTts.set.mock.calls;
    expect(calls[calls.length - 1]).toEqual([0]);
  });

  test('different text strings are NOT deduplicated', async () => {
    await Promise.all([synthesize('Text A'), synthesize('Text B')]);
    expect(mockSynthesizeMock).toHaveBeenCalledTimes(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Text truncation (>500 chars)
// ═════════════════════════════════════════════════════════════════════════════

describe('Text truncation', () => {
  test('truncates text to 500 chars before passing to provider', async () => {
    const longText = 'a'.repeat(600);
    await synthesize(longText);
    const calledWith = mockSynthesizeMock.mock.calls[0][0];
    expect(calledWith.length).toBe(500);
  });

  test('trims leading/trailing whitespace before synthesis', async () => {
    await synthesize('  trimmed  ');
    expect(mockSynthesizeMock).toHaveBeenCalledWith('trimmed');
  });
});
