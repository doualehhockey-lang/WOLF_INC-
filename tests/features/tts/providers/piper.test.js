// tests/features/tts/providers/piper.test.js
// Piper TTS: missing model path guard, subprocess success, subprocess failure,
// temp file cleanup in both success and error paths.

import { jest } from '@jest/globals';

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../../src/core/config.js', () => ({
  config: {
    PIPER_MODEL_PATH: '/models/fr.onnx',
    PIPER_BINARY:     '/usr/local/bin/piper',
  },
}));

// ── Mock fs/promises ──────────────────────────────────────────────────────────
const mockWriteFile = jest.fn(async () => {});
const mockReadFile  = jest.fn(async () => Buffer.alloc(100, 0xAB));
const mockUnlink    = jest.fn(async () => {});
const mockMkdir     = jest.fn(async () => {});
jest.unstable_mockModule('fs/promises', () => ({
  writeFile: mockWriteFile,
  readFile:  mockReadFile,
  unlink:    mockUnlink,
  mkdir:     mockMkdir,
}));

// ── Mock child_process / util ─────────────────────────────────────────────────
const mockExecFileAsync = jest.fn(async () => ({ stdout: '', stderr: '' }));
jest.unstable_mockModule('child_process', () => ({
  execFile: jest.fn(), // raw — not used directly (promisify wraps it)
}));
jest.unstable_mockModule('util', () => ({
  promisify: jest.fn(() => mockExecFileAsync),
}));

// ── Mock crypto randomUUID ────────────────────────────────────────────────────
let _uuidCount = 0;
jest.unstable_mockModule('crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${++_uuidCount}`),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { synthesizePiper } = await import('../../../../src/features/tts/providers/piper.js');
const { TtsError }        = await import('../../../../src/core/errors.js');
const { config }          = await import('../../../../src/core/config.js');

beforeEach(() => {
  jest.clearAllMocks();
  _uuidCount = 0;
  config.PIPER_MODEL_PATH = '/models/fr.onnx';
  config.PIPER_BINARY     = '/usr/local/bin/piper';
  mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
  mockReadFile.mockResolvedValue(Buffer.alloc(100, 0xAB));
  mockUnlink.mockResolvedValue(undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Guard — missing model path
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizePiper — guard', () => {
  test('throws TtsError when PIPER_MODEL_PATH is absent', async () => {
    config.PIPER_MODEL_PATH = '';
    await expect(synthesizePiper('Bonjour')).rejects.toBeInstanceOf(TtsError);
  });

  test('TtsError message mentions PIPER_MODEL_PATH', async () => {
    config.PIPER_MODEL_PATH = '';
    await expect(synthesizePiper('Bonjour')).rejects.toThrow('PIPER_MODEL_PATH');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Success path
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizePiper — success', () => {
  test('returns a Buffer', async () => {
    const result = await synthesizePiper('Bonjour');
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test('creates tmp dir with recursive:true', async () => {
    await synthesizePiper('Bonjour');
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('tmp'), { recursive: true });
  });

  test('writes text to input file (truncated to 1000 chars)', async () => {
    const longText = 'x'.repeat(2000);
    await synthesizePiper(longText);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.any(String),
      'x'.repeat(1000),
      'utf8',
    );
  });

  test('calls execFileAsync with piper binary and model flags', async () => {
    await synthesizePiper('Hello');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      '/usr/local/bin/piper',
      expect.arrayContaining(['--model', '/models/fr.onnx', '--output_file', expect.any(String)]),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  test('calls readFile on the output file', async () => {
    await synthesizePiper('Hello');
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  test('cleans up temp files (unlink called at least twice)', async () => {
    await synthesizePiper('Hello');
    expect(mockUnlink).toHaveBeenCalledTimes(2); // outFile + inFile
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Subprocess failure
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizePiper — subprocess failure', () => {
  test('throws TtsError when execFileAsync rejects', async () => {
    mockExecFileAsync.mockRejectedValueOnce(new Error('model not found'));
    await expect(synthesizePiper('Bonjour')).rejects.toBeInstanceOf(TtsError);
  });

  test('TtsError message includes original error message', async () => {
    mockExecFileAsync.mockRejectedValueOnce(new Error('model not found'));
    await expect(synthesizePiper('Bonjour')).rejects.toThrow('model not found');
  });

  test('cleans up temp files even on subprocess failure', async () => {
    mockExecFileAsync.mockRejectedValueOnce(new Error('crash'));
    await synthesizePiper('Bonjour').catch(() => {});
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Cleanup is best-effort (unlink failure does not propagate)
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizePiper — cleanup resilience', () => {
  test('does not throw when unlink rejects', async () => {
    mockUnlink.mockRejectedValue(new Error('EPERM'));
    await expect(synthesizePiper('Bonjour')).resolves.toBeDefined();
  });
});
