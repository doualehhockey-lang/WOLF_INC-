// tests/features/tts/providers/mock.test.js
// Mock TTS provider: WAV header structure, Buffer size, log call, pure function.

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
const mockLog = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.unstable_mockModule('../../../../src/core/logger.js', () => ({
  childLogger: () => mockLog,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { synthesizeMock } = await import('../../../../src/features/tts/providers/mock.js');

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// 1. Return type and structure
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeMock — return value', () => {
  test('returns a Buffer', async () => {
    const result = await synthesizeMock('Bonjour');
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test('buffer starts with RIFF marker', async () => {
    const result = await synthesizeMock('Bonjour');
    expect(result.slice(0, 4).toString('ascii')).toBe('RIFF');
  });

  test('buffer contains WAVE marker at offset 8', async () => {
    const result = await synthesizeMock('test');
    expect(result.slice(8, 12).toString('ascii')).toBe('WAVE');
  });

  test('buffer contains fmt marker at offset 12', async () => {
    const result = await synthesizeMock('test');
    expect(result.slice(12, 16).toString('ascii')).toBe('fmt ');
  });

  test('buffer contains data marker at offset 36', async () => {
    const result = await synthesizeMock('test');
    expect(result.slice(36, 40).toString('ascii')).toBe('data');
  });

  test('total buffer length is 44 (header) + 8000*2*1 (PCM data)', async () => {
    const result = await synthesizeMock('test');
    const expectedData = 8_000 * 2 * 1; // sampleRate * bytesPerSample * duration
    expect(result.length).toBe(44 + expectedData);
  });

  test('PCM audio data is silent (all zeros after header)', async () => {
    const result = await synthesizeMock('test');
    const data = result.slice(44);
    expect(data.every(b => b === 0)).toBe(true);
  });

  test('header encodes sample rate 8000 at offset 24', async () => {
    const result = await synthesizeMock('test');
    expect(result.readUInt32LE(24)).toBe(8_000);
  });

  test('header encodes PCM format (1) at offset 20', async () => {
    const result = await synthesizeMock('test');
    expect(result.readUInt16LE(20)).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Logging
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeMock — logging', () => {
  test('calls log.debug once per call', async () => {
    await synthesizeMock('Bonjour monde');
    expect(mockLog.debug).toHaveBeenCalledTimes(1);
  });

  test('log.debug truncates text to 60 chars', async () => {
    const longText = 'a'.repeat(100);
    await synthesizeMock(longText);
    const [obj] = mockLog.debug.mock.calls[0];
    expect(obj.text.length).toBeLessThanOrEqual(60);
  });

  test('log.debug includes text snippet', async () => {
    await synthesizeMock('Bonjour');
    const [obj] = mockLog.debug.mock.calls[0];
    expect(obj.text).toContain('Bonjour');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Idempotency
// ═════════════════════════════════════════════════════════════════════════════

describe('synthesizeMock — idempotency', () => {
  test('two calls return equal buffers', async () => {
    const r1 = await synthesizeMock('same text');
    const r2 = await synthesizeMock('same text');
    expect(r1.equals(r2)).toBe(true);
  });

  test('empty string is handled without error', async () => {
    await expect(synthesizeMock('')).resolves.toBeDefined();
  });
});
