// @ts-nocheck
// tests/services/tts.client.branches.test.js
// Covers tts.client.js remaining branch gaps:
//   Line 41:  if (!apiKey) — missing ELEVENLABS_API_KEY
//   Line 76:  if (!key)    — missing AZURE_TTS_KEY
//   Line 189: config.TTS_PROVIDER ?? 'mock' — undefined TTS_PROVIDER defaults to mock

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// Mutable config — tests override before each scenario
const cfg = {
  TTS_PROVIDER:        'elevenlabs',
  ELEVENLABS_API_KEY:  'el-test-key',
  ELEVENLABS_VOICE_ID: '21m00Tcm4TlvDq8ikWAM',
  AZURE_TTS_KEY:       'azure-test-key',
  AZURE_TTS_REGION:    'eastus',
  AZURE_TTS_VOICE:     'fr-FR-DeniseNeural',
};
jest.unstable_mockModule('../../src/core/config.js', () => ({ config: cfg }));

const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

jest.unstable_mockModule('../../src/services/metrics.js', () => ({
  recordRequest:   jest.fn(),
  recordFailure:   jest.fn(),
  recordLatency:   jest.fn(),
  setCircuitState: jest.fn(),
}));

const mockSynthesizeMock = jest.fn(async () => Buffer.alloc(44, 0));
jest.unstable_mockModule('../../src/features/tts/providers/mock.js', () => ({
  synthesizeMock: mockSynthesizeMock,
}));

jest.unstable_mockModule('../../src/features/tts/providers/piper.js', () => ({
  synthesizePiper: jest.fn(async () => Buffer.alloc(44, 1)),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

const { _makeSynthesize } = await import('../../src/services/tts.client.js');
const { CircuitBreaker }  = await import('../../src/services/circuitBreaker.js');

function makeClient() {
  const breaker = new CircuitBreaker(`tts-branches-${Math.random()}`, { failureThreshold: 100 });
  return _makeSynthesize(breaker, { maxRetries: 0, baseMs: 0, maxMs: 0 });
}

beforeEach(() => {
  jest.clearAllMocks();
  cfg.TTS_PROVIDER       = 'elevenlabs';
  cfg.ELEVENLABS_API_KEY = 'el-test-key';
  cfg.AZURE_TTS_KEY      = 'azure-test-key';
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 41: missing ELEVENLABS_API_KEY
// ═════════════════════════════════════════════════════════════════════════════

describe('_elevenlabs — missing API key (line 41)', () => {
  test('throws when ELEVENLABS_API_KEY is undefined', async () => {
    cfg.TTS_PROVIDER       = 'elevenlabs';
    cfg.ELEVENLABS_API_KEY = undefined;
    const synthesize = makeClient();
    await expect(synthesize('Bonjour', {})).rejects.toThrow('ELEVENLABS_API_KEY not configured');
  });

  test('throws when ELEVENLABS_API_KEY is empty string', async () => {
    cfg.TTS_PROVIDER       = 'elevenlabs';
    cfg.ELEVENLABS_API_KEY = '';
    const synthesize = makeClient();
    await expect(synthesize('Bonjour', {})).rejects.toThrow('ELEVENLABS_API_KEY not configured');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 76: missing AZURE_TTS_KEY
// ═════════════════════════════════════════════════════════════════════════════

describe('_azure — missing API key (line 76)', () => {
  test('throws when AZURE_TTS_KEY is undefined', async () => {
    cfg.TTS_PROVIDER  = 'azure';
    cfg.AZURE_TTS_KEY = undefined;
    const synthesize  = makeClient();
    await expect(synthesize('Bonjour', {})).rejects.toThrow('AZURE_TTS_KEY not configured');
  });

  test('throws when AZURE_TTS_KEY is empty string', async () => {
    cfg.TTS_PROVIDER  = 'azure';
    cfg.AZURE_TTS_KEY = '';
    const synthesize  = makeClient();
    await expect(synthesize('Bonjour', {})).rejects.toThrow('AZURE_TTS_KEY not configured');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 189: config.TTS_PROVIDER ?? 'mock'
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesize — TTS_PROVIDER ?? "mock" (line 189)', () => {
  test('uses mock provider when TTS_PROVIDER is undefined', async () => {
    cfg.TTS_PROVIDER = undefined;  // undefined → ?? 'mock' right side taken
    const synthesize = makeClient();
    const result     = await synthesize('Bonjour', {});
    expect(mockSynthesizeMock).toHaveBeenCalledWith('Bonjour');
    expect(result.ext).toBe('.wav');
    expect(result.mimeType).toBe('audio/wav');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 59: _elevenlabs — res.text().catch(() => '') when text() throws
// ═════════════════════════════════════════════════════════════════════════════

describe('_elevenlabs — res.text().catch fallback (line 59)', () => {
  test('catch(() => "") fires when res.text() rejects on non-ok response', async () => {
    cfg.TTS_PROVIDER = 'elevenlabs';
    mockApiFetch.mockResolvedValueOnce({
      ok:     false,
      status: 500,
      text:   jest.fn().mockRejectedValueOnce(new Error('body unreadable')),
    });
    const synthesize = makeClient();
    await expect(synthesize('Bonjour', {})).rejects.toThrow('ElevenLabs 500');
    // The catch handler () => '' was invoked — detail is '' → message still includes status
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 84, 106: _azure — res.text().catch(() => '') on both steps
// ═════════════════════════════════════════════════════════════════════════════

describe('_azure — res.text().catch fallback (lines 84, 106)', () => {
  test('catch(() => "") fires on token request failure when text() rejects (line 84)', async () => {
    cfg.TTS_PROVIDER = 'azure';
    mockApiFetch.mockResolvedValueOnce({
      ok:     false,
      status: 401,
      text:   jest.fn().mockRejectedValueOnce(new Error('body unreadable')),
    });
    const synthesize = makeClient();
    await expect(synthesize('Bonjour', {})).rejects.toThrow('Azure token 401');
  });

  test('catch(() => "") fires on TTS synthesis failure when text() rejects (line 106)', async () => {
    cfg.TTS_PROVIDER = 'azure';
    // Token request succeeds
    mockApiFetch.mockResolvedValueOnce({
      ok:   true,
      text: jest.fn().mockResolvedValueOnce('Bearer-token-xyz'),
    });
    // TTS synthesis request fails and text() throws
    mockApiFetch.mockResolvedValueOnce({
      ok:     false,
      status: 500,
      text:   jest.fn().mockRejectedValueOnce(new Error('body unreadable')),
    });
    const synthesize = makeClient();
    await expect(synthesize('Bonjour', {})).rejects.toThrow('Azure TTS 500');
  });
});
