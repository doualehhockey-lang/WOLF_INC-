// tests/features/tts/tts.flags.test.js
// Covers: TTS provider kill switches in tts.service.js
//   - TTS_ELEVENLABS=false → falls back to mock
//   - TTS_AZURE=false      → falls back to mock
//   - TTS_PIPER=false      → falls back to mock

import { jest } from '@jest/globals';

// ── Controllable flag mock ─────────────────────────────────────────────────────
const _disabledFlags = new Set();
jest.unstable_mockModule('../../../src/core/featureFlags.js', () => ({
  isEnabled: jest.fn(async flag => !_disabledFlags.has(flag)),
  FLAGS: {
    TTS_ELEVENLABS: 'tts.elevenlabs',
    TTS_AZURE: 'tts.azure',
    TTS_PIPER: 'tts.piper',
    PIPELINE_VOICE: 'pipeline.voice',
    RATE_LIMIT: 'rate-limit',
    CLAUDE_NLU: 'claude.nlu',
  },
  setFlag: jest.fn(),
  getAllFlags: jest.fn(),
  snapshotFlags: jest.fn(() => ({})),
  clearCache: jest.fn(),
}));

jest.unstable_mockModule('../../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// Force provider via config mock — changed per test group
const _config = { TTS_PROVIDER: 'mock' };
jest.unstable_mockModule('../../../src/core/config.js', () => ({ config: _config }));

jest.unstable_mockModule('../../../src/core/metrics.js', () => ({
  ttsLatency: { startTimer: jest.fn(() => jest.fn()) },
  inflightTts: { set: jest.fn() },
  rateLimitCounter: { inc: jest.fn() },
  pipelineLatency: { startTimer: jest.fn(() => jest.fn()) },
  errorCounter: { inc: jest.fn() },
  activeSessions: { set: jest.fn() },
  auditLogFailures: { inc: jest.fn() },
}));

jest.unstable_mockModule('../../../src/core/errors.js', () => ({
  TtsError: class TtsError extends Error {
    constructor(m) {
      super(m);
      this.name = 'TtsError';
    }
  },
}));

const mockCacheGet = jest.fn(async () => null);
const mockCacheSet = jest.fn(async () => {});
jest.unstable_mockModule('../../../src/features/tts/tts.cache.js', () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
}));

const mockBuf = Buffer.from('mock-audio');
jest.unstable_mockModule('../../../src/features/tts/providers/mock.js', () => ({
  synthesizeMock: jest.fn(async () => mockBuf),
}));

const mockElevenLabsBuf = Buffer.from('elevenlabs-audio');
jest.unstable_mockModule('../../../src/features/tts/providers/elevenlabs.js', () => ({
  synthesizeElevenLabs: jest.fn(async () => mockElevenLabsBuf),
}));

const mockAzureBuf = Buffer.from('azure-audio');
jest.unstable_mockModule('../../../src/features/tts/providers/azure.js', () => ({
  synthesizeAzure: jest.fn(async () => mockAzureBuf),
}));

const mockPiperBuf = Buffer.from('piper-audio');
jest.unstable_mockModule('../../../src/features/tts/providers/piper.js', () => ({
  synthesizePiper: jest.fn(async () => mockPiperBuf),
}));

const { synthesize } = await import('../../../src/features/tts/tts.service.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
  _disabledFlags.clear();
  _config.TTS_PROVIDER = 'mock';
});

// ── ElevenLabs kill switch ────────────────────────────────────────────────────

describe('TTS_ELEVENLABS=false', () => {
  test('falls back to mock when ElevenLabs flag is disabled', async () => {
    _config.TTS_PROVIDER = 'elevenlabs';
    _disabledFlags.add('tts.elevenlabs');

    const result = await synthesize('hello world', 'en-US');

    const { synthesizeMock } = await import('../../../src/features/tts/providers/mock.js');
    const { synthesizeElevenLabs } =
      await import('../../../src/features/tts/providers/elevenlabs.js');

    expect(synthesizeMock).toHaveBeenCalled();
    expect(synthesizeElevenLabs).not.toHaveBeenCalled();
    expect(result.buffer).toEqual(mockBuf);
    expect(result.ext).toBe('.wav');
  });
});

// ── Azure kill switch ─────────────────────────────────────────────────────────

describe('TTS_AZURE=false', () => {
  test('falls back to mock when Azure flag is disabled', async () => {
    _config.TTS_PROVIDER = 'azure';
    _disabledFlags.add('tts.azure');

    const result = await synthesize('bonjour', 'fr-FR');

    const { synthesizeMock } = await import('../../../src/features/tts/providers/mock.js');
    const { synthesizeAzure } = await import('../../../src/features/tts/providers/azure.js');

    expect(synthesizeMock).toHaveBeenCalled();
    expect(synthesizeAzure).not.toHaveBeenCalled();
    expect(result.buffer).toEqual(mockBuf);
  });
});

// ── Piper kill switch ─────────────────────────────────────────────────────────

describe('TTS_PIPER=false', () => {
  test('falls back to mock when Piper flag is disabled', async () => {
    _config.TTS_PROVIDER = 'piper';
    _disabledFlags.add('tts.piper');

    const result = await synthesize('test text', 'fr-FR');

    const { synthesizeMock } = await import('../../../src/features/tts/providers/mock.js');
    const { synthesizePiper } = await import('../../../src/features/tts/providers/piper.js');

    expect(synthesizeMock).toHaveBeenCalled();
    expect(synthesizePiper).not.toHaveBeenCalled();
    expect(result.buffer).toEqual(mockBuf);
  });
});
