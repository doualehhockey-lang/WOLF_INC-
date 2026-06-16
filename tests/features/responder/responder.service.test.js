// tests/features/responder/responder.service.test.js
// Responder: getTones() shape, autoReply() tone selection, unknown tone fallback,
<<<<<<< HEAD
// config.SMS_TONE default, claude delegation.
=======
// config.SMS_TONE default, ollama.client delegation.
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

import { jest } from '@jest/globals';

// ── Mock config ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../../src/core/config.js', () => ({
<<<<<<< HEAD
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
=======
  config: { SMS_TONE: 'friendly' },
}));

// ── Mock ollama.client ────────────────────────────────────────────────────────
const mockChat = jest.fn(async () => 'Mocked reply');
jest.unstable_mockModule('../../../src/services/ollama.client.js', () => ({
  chat: mockChat,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { autoReply, getTones, TONES, DEFAULT_TONE } =
  await import('../../../src/features/responder/responder.service.js');
const { config } = await import('../../../src/core/config.js');

beforeEach(() => {
  jest.clearAllMocks();
  config.SMS_TONE = 'friendly';
<<<<<<< HEAD
  mockCreate.mockResolvedValue({ content: [{ text: 'Mocked reply' }] });
=======
  mockChat.mockResolvedValue('Mocked reply');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('chaleureux');
=======
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('chaleureux');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('uses "pro" tone system prompt when tone is "pro"', async () => {
    await autoReply('Merci', 'pro');
<<<<<<< HEAD
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('professionnel');
=======
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toContain('professionnel');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('uses "sec" tone system prompt when tone is "sec"', async () => {
    await autoReply('Ok', 'sec');
<<<<<<< HEAD
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('minimaliste');
=======
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toContain('minimaliste');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('uses "sarcastique" tone system prompt', async () => {
    await autoReply('Ahh', 'sarcastique');
<<<<<<< HEAD
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('sarcastique');
=======
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toContain('sarcastique');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('uses "wolf-inc" tone system prompt', async () => {
    await autoReply('Go', 'wolf-inc');
<<<<<<< HEAD
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('agressif');
=======
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toContain('agressif');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });

  test('falls back to DEFAULT_TONE system prompt for unknown tone', async () => {
    await autoReply('Test', 'nonexistent-tone');
<<<<<<< HEAD
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toBe(TONES[DEFAULT_TONE]);
=======
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toBe(TONES[DEFAULT_TONE]);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. autoReply — default tone from config
// ═════════════════════════════════════════════════════════════════════════════

describe('autoReply — config.SMS_TONE default', () => {
  test('uses config.SMS_TONE when no tone argument provided', async () => {
    config.SMS_TONE = 'pro';
    await autoReply('Message');
<<<<<<< HEAD
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toBe(TONES.pro);
=======
    const [messages] = mockChat.mock.calls[0];
    expect(messages[0].content).toBe(TONES.pro);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});

// ═════════════════════════════════════════════════════════════════════════════
<<<<<<< HEAD
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
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const result = await autoReply('Hi', 'friendly');
    expect(result).toBe('Bonjour!');
  });

<<<<<<< HEAD
  test('calls create exactly once per autoReply call', async () => {
    await autoReply('Test', 'friendly');
    expect(mockCreate).toHaveBeenCalledTimes(1);
=======
  test('calls chat exactly once per autoReply call', async () => {
    await autoReply('Test', 'friendly');
    expect(mockChat).toHaveBeenCalledTimes(1);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
});
