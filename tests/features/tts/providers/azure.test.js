// tests/features/tts/providers/azure.test.js
// Azure TTS: missing key guard, token fetch failure, synthesis failure,
// success path returning Buffer, SSML XML escaping, custom locale.

import { jest } from '@jest/globals';

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../../src/core/config.js', () => ({
  config: {
    AZURE_TTS_KEY: 'test-key',
    AZURE_TTS_REGION: 'westeurope',
    AZURE_TTS_VOICE: 'fr-FR-DeniseNeural',
  },
}));

// ── Mock TtsError (use real class) ────────────────────────────────────────────

// ── Mock apiFetch ─────────────────────────────────────────────────────────────
const mockApiFetch = jest.fn();
jest.unstable_mockModule('../../../../src/infra/http/httpClient.js', () => ({
  apiFetch: mockApiFetch,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { synthesizeAzure } = await import('../../../../src/features/tts/providers/azure.js');
const { TtsError } = await import('../../../../src/core/errors.js');
const { config } = await import('../../../../src/core/config.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTokenRes(ok = true) {
  return { ok, status: ok ? 200 : 401, text: async () => 'fake-bearer-token' };
}
function makeTtsRes(ok = true) {
  const buf = Buffer.alloc(16, 0xab);
  return {
    ok,
    status: ok ? 200 : 503,
    arrayBuffer: async () => buf.buffer,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  config.AZURE_TTS_KEY = 'test-key';
  config.AZURE_TTS_REGION = 'westeurope';
  config.AZURE_TTS_VOICE = 'fr-FR-DeniseNeural';
  // Default: both fetches succeed
  mockApiFetch
    .mockResolvedValueOnce(makeTokenRes(true)) // token
    .mockResolvedValueOnce(makeTtsRes(true)); // synthesis
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Guard — missing API key
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeAzure — guard', () => {
  test('throws TtsError when AZURE_TTS_KEY is absent', async () => {
    config.AZURE_TTS_KEY = '';
    await expect(synthesizeAzure('Bonjour')).rejects.toBeInstanceOf(TtsError);
  });

  test('TtsError message mentions AZURE_TTS_KEY', async () => {
    config.AZURE_TTS_KEY = '';
    await expect(synthesizeAzure('Bonjour')).rejects.toThrow('AZURE_TTS_KEY');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Token fetch failure
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeAzure — token request fails', () => {
  test('throws TtsError when token endpoint returns non-ok', async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValueOnce(makeTokenRes(false));
    await expect(synthesizeAzure('Bonjour')).rejects.toBeInstanceOf(TtsError);
  });

  test('TtsError message includes status code', async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValueOnce(makeTokenRes(false));
    await expect(synthesizeAzure('Bonjour')).rejects.toThrow('401');
  });

  test('throws TtsError when apiFetch itself throws', async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(synthesizeAzure('Bonjour')).rejects.toThrow('ECONNREFUSED');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. TTS synthesis failure
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeAzure — synthesis request fails', () => {
  test('throws TtsError when TTS endpoint returns non-ok', async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValueOnce(makeTokenRes(true)).mockResolvedValueOnce(makeTtsRes(false));
    await expect(synthesizeAzure('Bonjour')).rejects.toBeInstanceOf(TtsError);
  });

  test('TtsError message includes synthesis status', async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValueOnce(makeTokenRes(true)).mockResolvedValueOnce(makeTtsRes(false));
    await expect(synthesizeAzure('Bonjour')).rejects.toThrow('503');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Success path
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeAzure — success', () => {
  test('returns a Buffer', async () => {
    const result = await synthesizeAzure('Bonjour');
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test('calls apiFetch twice (token + synthesis)', async () => {
    await synthesizeAzure('Bonjour');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  test('first call goes to issueToken endpoint', async () => {
    await synthesizeAzure('Bonjour');
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toContain('issueToken');
    expect(url).toContain('westeurope');
  });

  test('second call goes to TTS cognitiveservices endpoint', async () => {
    await synthesizeAzure('Bonjour');
    const [url] = mockApiFetch.mock.calls[1];
    expect(url).toContain('cognitiveservices/v1');
    expect(url).toContain('westeurope');
  });

  test('second call includes Bearer token in Authorization header', async () => {
    await synthesizeAzure('Bonjour');
    const [, opts] = mockApiFetch.mock.calls[1];
    expect(opts.headers.Authorization).toBe('Bearer fake-bearer-token');
  });

  test('SSML body contains the text', async () => {
    await synthesizeAzure('Bonjour monde');
    const [, opts] = mockApiFetch.mock.calls[1];
    expect(opts.body).toContain('Bonjour monde');
  });

  test('SSML body contains configured voice name', async () => {
    await synthesizeAzure('Test');
    const [, opts] = mockApiFetch.mock.calls[1];
    expect(opts.body).toContain('fr-FR-DeniseNeural');
  });

  test('SSML body uses provided locale', async () => {
    await synthesizeAzure('Test', 'en-US');
    const [, opts] = mockApiFetch.mock.calls[1];
    expect(opts.body).toContain('en-US');
  });

  test('defaults locale to fr-FR', async () => {
    await synthesizeAzure('Test');
    const [, opts] = mockApiFetch.mock.calls[1];
    expect(opts.body).toContain('fr-FR');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. XML escaping in SSML
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeAzure — XML escaping', () => {
  test('escapes ampersand in text', async () => {
    await synthesizeAzure('fish & chips');
    const [, opts] = mockApiFetch.mock.calls[1];
    expect(opts.body).toContain('fish &amp; chips');
  });

  test('escapes less-than in text', async () => {
    await synthesizeAzure('a < b');
    const [, opts] = mockApiFetch.mock.calls[1];
    expect(opts.body).toContain('a &lt; b');
  });

  test('escapes greater-than in text', async () => {
    await synthesizeAzure('a > b');
    const [, opts] = mockApiFetch.mock.calls[1];
    expect(opts.body).toContain('a &gt; b');
  });

  test('escapes double-quote in text', async () => {
    await synthesizeAzure('say "hello"');
    const [, opts] = mockApiFetch.mock.calls[1];
    expect(opts.body).toContain('say &quot;hello&quot;');
  });
});
