// tests/features/responder/responder.service.test.js
// Responder: getTones() shape, autoReply() tone selection, unknown tone fallback,
// config.SMS_TONE default, claude delegation.

import { jest } from '@jest/globals';

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
  config: {
    SMS_TONE: 'friendly',
    CLAUDE_API_KEY: 'test-key',
    CLAUDE_MODEL: 'claude-haiku-4-5-20251001',
  },
}));

// ── Mock @anthropic-ai/sdk ────────────────────────────────────────────────────
const mockCreate = jest.fn(async () => ({
  content: [{ text: 'Mocked reply' }],
}));

jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { autoReply, getTones, TONES, DEFAULT_TONE } =
  await import('../../../src/features/responder/responder.service.js');
const { config } = await import('../../../src/core/config.js');

beforeEach(() => {
  jest.clearAllMocks();
  config.SMS_TONE = 'friendly';
  mockCreate.mockResolvedValue({ content: [{ text: 'Mocked reply' }] });
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
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('chaleureux');
  });

  test('uses "pro" tone system prompt when tone is "pro"', async () => {
    await autoReply('Merci', 'pro');
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('professionnel');
  });

  test('uses "sec" tone system prompt when tone is "sec"', async () => {
    await autoReply('Ok', 'sec');
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('minimaliste');
  });

  test('uses "sarcastique" tone system prompt', async () => {
    await autoReply('Ahh', 'sarcastique');
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('sarcastique');
  });

  test('uses "wolf-inc" tone system prompt', async () => {
    await autoReply('Go', 'wolf-inc');
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('agressif');
  });

  test('falls back to DEFAULT_TONE system prompt for unknown tone', async () => {
    await autoReply('Test', 'nonexistent-tone');
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toBe(TONES[DEFAULT_TONE]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. autoReply — default tone from config
// ═════════════════════════════════════════════════════════════════════════════

describe('autoReply — config.SMS_TONE default', () => {
  test('uses config.SMS_TONE when no tone argument provided', async () => {
    config.SMS_TONE = 'pro';
    await autoReply('Message');
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toBe(TONES.pro);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. autoReply — Claude delegation
// ═════════════════════════════════════════════════════════════════════════════

describe('autoReply — claude delegation', () => {
  test('passes user content in messages', async () => {
    await autoReply('Hello world', 'friendly');
    const call = mockCreate.mock.calls[0][0];
    expect(call.messages[0].role).toBe('user');
    expect(call.messages[0].content).toBe('Hello world');
  });

  test('passes max_tokens 120', async () => {
    await autoReply('Test', 'friendly');
    const call = mockCreate.mock.calls[0][0];
    expect(call.max_tokens).toBe(120);
  });

  test('returns the text from Claude response', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ text: 'Bonjour!' }] });
    const result = await autoReply('Hi', 'friendly');
    expect(result).toBe('Bonjour!');
  });

  test('calls create exactly once per autoReply call', async () => {
    await autoReply('Test', 'friendly');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
