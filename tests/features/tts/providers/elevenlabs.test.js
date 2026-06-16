// tests/features/tts/providers/elevenlabs.test.js
// ElevenLabs TTS: missing key guard, API error path (with detail text),
// success path returning Buffer, correct request shape.

import { jest } from '@jest/globals';

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../../src/core/config.js', () => ({
  config: {
    ELEVENLABS_API_KEY: 'el-test-key',
    ELEVENLABS_VOICE_ID: 'voice-abc123',
  },
}));

// ── Mock apiFetch ─────────────────────────────────────────────────────────────
const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { synthesizeElevenLabs } =
  await import('../../../../src/features/tts/providers/elevenlabs.js');
const { TtsError } = await import('../../../../src/core/errors.js');
const { config } = await import('../../../../src/core/config.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
const fakeBuf = Buffer.alloc(24, 0xff);
function makeOkRes() {
  return { ok: true, status: 200, arrayBuffer: async () => fakeBuf.buffer };
}
function makeErrRes(status = 422, detail = 'invalid voice') {
  return { ok: false, status, text: async () => detail };
}

beforeEach(() => {
  jest.clearAllMocks();
  config.ELEVENLABS_API_KEY = 'el-test-key';
  config.ELEVENLABS_VOICE_ID = 'voice-abc123';
  mockApiFetch.mockResolvedValue(makeOkRes());
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Guard — missing API key
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeElevenLabs — guard', () => {
  test('throws TtsError when ELEVENLABS_API_KEY is absent', async () => {
    config.ELEVENLABS_API_KEY = '';
    await expect(synthesizeElevenLabs('Bonjour')).rejects.toBeInstanceOf(TtsError);
  });

  test('TtsError message mentions ELEVENLABS_API_KEY', async () => {
    config.ELEVENLABS_API_KEY = '';
    await expect(synthesizeElevenLabs('Bonjour')).rejects.toThrow('ELEVENLABS_API_KEY');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. API error — non-ok response
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeElevenLabs — API error', () => {
  test('throws TtsError on non-ok response', async () => {
    mockApiFetch.mockResolvedValueOnce(makeErrRes(429, 'quota exceeded'));
    await expect(synthesizeElevenLabs('Bonjour')).rejects.toBeInstanceOf(TtsError);
  });

  test('TtsError message includes status code', async () => {
    mockApiFetch.mockResolvedValueOnce(makeErrRes(429, 'quota exceeded'));
    await expect(synthesizeElevenLabs('Bonjour')).rejects.toThrow('429');
  });

  test('TtsError message includes detail from response body', async () => {
    mockApiFetch.mockResolvedValueOnce(makeErrRes(422, 'invalid voice'));
    await expect(synthesizeElevenLabs('Bonjour')).rejects.toThrow('invalid voice');
  });

  test('TtsError message shows empty string when body.text() rejects', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('body gone');
      },
    });
    await expect(synthesizeElevenLabs('Bonjour')).rejects.toBeInstanceOf(TtsError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Success path
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeElevenLabs — success', () => {
  test('returns a Buffer', async () => {
    const result = await synthesizeElevenLabs('Bonjour');
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test('calls apiFetch once', async () => {
    await synthesizeElevenLabs('Test text');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  test('URL contains voiceId', async () => {
    await synthesizeElevenLabs('Test text');
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toContain('voice-abc123');
  });

  test('URL targets ElevenLabs endpoint', async () => {
    await synthesizeElevenLabs('Test');
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toContain('api.elevenlabs.io');
  });

  test('request includes xi-api-key header', async () => {
    await synthesizeElevenLabs('Test');
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.headers['xi-api-key']).toBe('el-test-key');
  });

  test('request body contains text field', async () => {
    await synthesizeElevenLabs('Bonjour monde');
    const [, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.text).toBe('Bonjour monde');
  });

  test('request body uses eleven_multilingual_v2 model', async () => {
    await synthesizeElevenLabs('Test');
    const [, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.model_id).toBe('eleven_multilingual_v2');
  });

  test('request body includes voice_settings', async () => {
    await synthesizeElevenLabs('Test');
    const [, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.voice_settings).toMatchObject({
      stability: expect.any(Number),
      similarity_boost: expect.any(Number),
    });
  });

  test('Accept header is audio/mpeg', async () => {
    await synthesizeElevenLabs('Test');
    const [, opts] = mockApiFetch.mock.calls[0];
    expect(opts.headers['Accept']).toBe('audio/mpeg');
  });
});
