// @ts-nocheck
// tests/features/responder/responder.service.test.js
// Responder: getTones() shape, autoReply() tone selection, unknown tone fallback,
// config.SMS_TONE default, ollama.client delegation.

import { jest } from '@jest/globals';

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: { SMS_TONE: 'friendly' },
}));

// ── Mock ollama.client ────────────────────────────────────────────────────────
const mockChat = jest.fn(async () => 'Mocked reply');
jest.unstable_mockModule('../../../src/services/ollama.client.js', () => ({
  chat: mockChat,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { autoReply, getTones, TONES, DEFAULT_TONE } =
  await import('../../../src/features/responder/responder.service.js');
const { config } = await import('../../../src/core/config.js');

beforeEach(() => {
  jest.clearAllMocks();
  config.SMS_TONE = 'friendly';
  mockChat.mockResolvedValue('Mocked reply');
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. getTones
// ═════════════════════════════════════════════════════════════════════════════

describe('getTones', () => {
  test('returns an array', () => {
    expect(Array.isArray(getTones())).toBe(true);
  });

  test('includes all expected tone keys', () => {
    const tones = getTones();
    expect(tones).toContain('pro');
    expect(tones).toContain('sec');
    expect(tones).toContain('friendly');
    expect(tones).toContain('sarcastique');
    expect(tones).toContain('wolf-inc');
  });

  test('returns same keys as TONES object', () => {
    expect(getTones()).toEqual(Object.keys(TONES));
  });

  test('returns 5 tones', () => {
    expect(getTones().length).toBe(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. autoReply — tone selection
// ═════════════════════════════════════════════════════════════════════════════

describe('autoReply — tone selection', () => {
  test('uses "friendly" tone system prompt when tone is "friendly"', async () => {
    await autoReply('Bonjour', 'friendly');
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('chaleureux');
  });

  test('uses "pro" tone system prompt when tone is "pro"', async () => {
    await autoReply('Merci', 'pro');
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toContain('professionnel');
  });

  test('uses "sec" tone system prompt when tone is "sec"', async () => {
    await autoReply('Ok', 'sec');
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toContain('minimaliste');
  });

  test('uses "sarcastique" tone system prompt', async () => {
    await autoReply('Ahh', 'sarcastique');
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toContain('sarcastique');
  });

  test('uses "wolf-inc" tone system prompt', async () => {
    await autoReply('Go', 'wolf-inc');
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toContain('agressif');
  });

  test('falls back to DEFAULT_TONE system prompt for unknown tone', async () => {
    await autoReply('Test', 'nonexistent-tone');
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toBe(TONES[DEFAULT_TONE]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. autoReply — default tone from config
// ═════════════════════════════════════════════════════════════════════════════

describe('autoReply — config.SMS_TONE default', () => {
  test('uses config.SMS_TONE when no tone argument provided', async () => {
    config.SMS_TONE = 'pro';
    await autoReply('Message');
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toBe(TONES.pro);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. autoReply — ollama delegation
// ═════════════════════════════════════════════════════════════════════════════

describe('autoReply — ollama.client delegation', () => {
  test('passes user content as second message', async () => {
    await autoReply('Hello world', 'friendly');
    const [messages] = mockChat.mock.calls[0];
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('Hello world');
  });

  test('passes temperature 0.7 and num_predict 120', async () => {
    await autoReply('Test', 'friendly');
    const [, opts] = mockChat.mock.calls[0];
    expect(opts.temperature).toBe(0.7);
    expect(opts.num_predict).toBe(120);
  });

  test('returns the string returned by chat()', async () => {
    mockChat.mockResolvedValueOnce('Bonjour!');
    const result = await autoReply('Hi', 'friendly');
    expect(result).toBe('Bonjour!');
  });

  test('calls chat exactly once per autoReply call', async () => {
    await autoReply('Test', 'friendly');
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});
