// tests/features/memory/session.schema.test.js

import { parseSession, defaultSession, SessionSchema } from '../../../src/features/memory/session.schema.js';

describe('SessionSchema', () => {
  test('defaultSession returns a valid session', () => {
    const s = defaultSession('CA1234567890');
    expect(s.callSid).toBe('CA1234567890');
    expect(s.turns).toEqual([]);
    expect(s.lang).toBe('fr');
    expect(s.pendingIntent).toBeNull();
    expect(typeof s.lastActivity).toBe('number');
  });

  test('parseSession accepts a valid session object', () => {
    const raw = {
      callSid:        'CA123',
      turns:          [{ role: 'user', content: 'hello', ts: Date.now() }],
      lang:           'en',
      pendingIntent:  null,
      pendingDate:    null,
      pendingTime:    null,
      pendingSubject: null,
      lastActivity:   Date.now(),
    };
    const result = parseSession(raw);
    expect(result).not.toBeNull();
    expect(result.lang).toBe('en');
    expect(result.turns).toHaveLength(1);
  });

  test('parseSession returns null for invalid input', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession({})).toBeNull();        // missing callSid
    expect(parseSession({ callSid: '' })).toBeNull(); // empty callSid
  });

  test('parseSession rejects invalid turn role', () => {
    const raw = {
      callSid:      'CA123',
      turns:        [{ role: 'admin', content: 'hack', ts: Date.now() }],
      lastActivity: Date.now(),
    };
    expect(parseSession(raw)).toBeNull();
  });

  test('session serializes and round-trips via JSON', () => {
    const original = defaultSession('CA999');
    const json     = JSON.stringify(original);
    const parsed   = parseSession(JSON.parse(json));
    expect(parsed).not.toBeNull();
    expect(parsed.callSid).toBe('CA999');
  });
});
