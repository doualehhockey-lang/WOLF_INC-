// tests/services/audio.utils.test.js
// Audio utilities: mulawToWav, pcm16ToWav, downloadTwilioMedia, saveAudio.
// Covers: WAV header structure, error guards, HTTP auth, disk persistence.

import { jest } from '@jest/globals';

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: { AUDIO_DIR: '/tmp/audio' },
}));

// ── Mock fs/promises ──────────────────────────────────────────────────────────
<<<<<<< HEAD
const mockMkdir = jest.fn(async () => {});
const mockWriteFile = jest.fn(async () => {});
const mockReaddir = jest.fn(async () => []);
const mockUnlink = jest.fn(async () => {});
const mockStat = jest.fn(async () => ({ mtimeMs: Date.now() }));
jest.unstable_mockModule('fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  readdir: mockReaddir,
  unlink: mockUnlink,
  stat: mockStat,
=======
const mockMkdir     = jest.fn(async () => {});
const mockWriteFile = jest.fn(async () => {});
const mockReaddir   = jest.fn(async () => []);
const mockUnlink    = jest.fn(async () => {});
const mockStat      = jest.fn(async () => ({ mtimeMs: Date.now() }));
jest.unstable_mockModule('fs/promises', () => ({
  mkdir:    mockMkdir,
  writeFile: mockWriteFile,
  readdir:  mockReaddir,
  unlink:   mockUnlink,
  stat:     mockStat,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Mock global fetch ─────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { mulawToWav, pcm16ToWav, downloadTwilioMedia, saveAudio } =
  await import('../../src/services/audio.utils.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. pcm16ToWav
// ═════════════════════════════════════════════════════════════════════════════

describe('pcm16ToWav', () => {
  test('throws TypeError for non-Buffer input', () => {
    expect(() => pcm16ToWav('not-a-buffer')).toThrow(TypeError);
    expect(() => pcm16ToWav('not-a-buffer')).toThrow('expected Buffer');
  });

  test('throws for Uint8Array (not a Node Buffer)', () => {
    expect(() => pcm16ToWav(new Uint8Array(16))).toThrow(TypeError);
  });

  test('returns a Buffer', () => {
    const pcm = Buffer.alloc(16, 0x00);
    expect(Buffer.isBuffer(pcm16ToWav(pcm))).toBe(true);
  });

  test('output starts with RIFF marker', () => {
    const result = pcm16ToWav(Buffer.alloc(8));
    expect(result.slice(0, 4).toString('ascii')).toBe('RIFF');
  });

  test('output has WAVE marker at offset 8', () => {
    const result = pcm16ToWav(Buffer.alloc(8));
    expect(result.slice(8, 12).toString('ascii')).toBe('WAVE');
  });

  test('total length is 44 + pcm.length', () => {
    const pcm = Buffer.alloc(200);
    expect(pcm16ToWav(pcm).length).toBe(244);
  });

  test('encodes sample rate at offset 24', () => {
    const result = pcm16ToWav(Buffer.alloc(8), 44_100);
    expect(result.readUInt32LE(24)).toBe(44_100);
  });

  test('defaults sample rate to 16000', () => {
    const result = pcm16ToWav(Buffer.alloc(8));
    expect(result.readUInt32LE(24)).toBe(16_000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. mulawToWav
// ═════════════════════════════════════════════════════════════════════════════

describe('mulawToWav', () => {
  test('throws TypeError for non-Buffer input', () => {
    expect(() => mulawToWav('string')).toThrow(TypeError);
  });

  test('returns a Buffer', () => {
<<<<<<< HEAD
    const mulaw = Buffer.alloc(10, 0x7f);
=======
    const mulaw = Buffer.alloc(10, 0x7F);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(Buffer.isBuffer(mulawToWav(mulaw))).toBe(true);
  });

  test('output starts with RIFF (valid WAV)', () => {
    const result = mulawToWav(Buffer.alloc(8, 0x00));
    expect(result.slice(0, 4).toString('ascii')).toBe('RIFF');
  });

  test('output length is 44 + (input.length * 2)', () => {
<<<<<<< HEAD
    const mulaw = Buffer.alloc(100, 0x7f);
=======
    const mulaw = Buffer.alloc(100, 0x7F);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    // mulawToWav converts each byte to 2-byte PCM, then wraps in WAV (44-byte header)
    expect(mulawToWav(mulaw).length).toBe(44 + 100 * 2);
  });

  test('decodes 0xFF mulaw byte without throwing', () => {
<<<<<<< HEAD
    const mulaw = Buffer.from([0xff]);
=======
    const mulaw = Buffer.from([0xFF]);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(() => mulawToWav(mulaw)).not.toThrow();
  });

  test('decodes 0x00 mulaw byte without throwing', () => {
    const mulaw = Buffer.from([0x00]);
    expect(() => mulawToWav(mulaw)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. downloadTwilioMedia
// ═════════════════════════════════════════════════════════════════════════════

describe('downloadTwilioMedia', () => {
  const URL = 'https://media.twilio.com/recordings/rec123';

  test('throws when url is absent', async () => {
    await expect(downloadTwilioMedia(null)).rejects.toThrow('url required');
    await expect(downloadTwilioMedia('')).rejects.toThrow('url required');
  });

  test('adds Authorization header when accountSid and authToken provided', async () => {
    const fakeBuf = Buffer.alloc(10);
    mockFetch.mockResolvedValueOnce({
<<<<<<< HEAD
      ok: true,
      arrayBuffer: async () => fakeBuf.buffer,
=======
      ok: true, arrayBuffer: async () => fakeBuf.buffer,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });
    await downloadTwilioMedia(URL, 'ACxxx', 'token-yyy');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toMatch(/^Basic /);
    const b64 = opts.headers.Authorization.slice(6);
    expect(Buffer.from(b64, 'base64').toString()).toBe('ACxxx:token-yyy');
  });

  test('does NOT add Authorization header when credentials are absent', async () => {
    const fakeBuf = Buffer.alloc(10);
    mockFetch.mockResolvedValueOnce({
<<<<<<< HEAD
      ok: true,
      arrayBuffer: async () => fakeBuf.buffer,
=======
      ok: true, arrayBuffer: async () => fakeBuf.buffer,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });
    await downloadTwilioMedia(URL);
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
  });

  test('throws when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(downloadTwilioMedia(URL)).rejects.toThrow('403');
  });

  test('returns Buffer on success', async () => {
<<<<<<< HEAD
    const fakeBuf = Buffer.alloc(20, 0xcd);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeBuf.buffer,
=======
    const fakeBuf = Buffer.alloc(20, 0xCD);
    mockFetch.mockResolvedValueOnce({
      ok: true, arrayBuffer: async () => fakeBuf.buffer,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    });
    const result = await downloadTwilioMedia(URL);
    expect(Buffer.isBuffer(result)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. saveAudio
// ═════════════════════════════════════════════════════════════════════════════

describe('saveAudio', () => {
  test('calls mkdir with recursive:true', async () => {
    await saveAudio(Buffer.alloc(10), '/tmp/audio', 'wav');
    expect(mockMkdir).toHaveBeenCalledWith('/tmp/audio', { recursive: true });
  });

  test('calls writeFile with the buffer', async () => {
<<<<<<< HEAD
    const buf = Buffer.alloc(10, 0xab);
=======
    const buf = Buffer.alloc(10, 0xAB);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    await saveAudio(buf, '/tmp/audio', 'wav');
    expect(mockWriteFile).toHaveBeenCalledWith(expect.any(String), buf);
  });

  test('returns filename matching tts_<timestamp>.<ext>', async () => {
    const { filename } = await saveAudio(Buffer.alloc(10), '/tmp/audio', 'wav');
    expect(filename).toMatch(/^tts_\d+\.wav$/);
  });

  test('returns filepath containing dir', async () => {
    const { filepath } = await saveAudio(Buffer.alloc(10), '/tmp/audio', 'wav');
    expect(filepath).toContain('/tmp/audio');
  });

  test('strips leading dot from ext', async () => {
    const { filename } = await saveAudio(Buffer.alloc(10), '/tmp/audio', '.mp3');
    expect(filename).toMatch(/\.mp3$/);
    expect(filename).not.toMatch(/\.\./); // no double dot
  });

  test('defaults ext to "wav"', async () => {
    const { filename } = await saveAudio(Buffer.alloc(10), '/tmp/audio');
    expect(filename).toMatch(/\.wav$/);
  });

  test('strips trailing slash from dir in filepath', async () => {
    const { filepath } = await saveAudio(Buffer.alloc(10), '/tmp/audio/', 'wav');
    expect(filepath).not.toMatch(/\/\//);
  });
});
