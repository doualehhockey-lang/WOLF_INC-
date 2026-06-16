// tests/features/memory/session.schema.test.js

<<<<<<< HEAD
import {
  parseSession,
  defaultSession,
  SessionSchema,
} from '../../../src/features/memory/session.schema.js';
=======
import { parseSession, defaultSession, SessionSchema } from '../../../src/features/memory/session.schema.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

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
<<<<<<< HEAD
      callSid: 'CA123',
      turns: [{ role: 'user', content: 'hello', ts: Date.now() }],
      lang: 'en',
      pendingIntent: null,
      pendingDate: null,
      pendingTime: null,
      pendingSubject: null,
      lastActivity: Date.now(),
=======
      callSid:        'CA123',
      turns:          [{ role: 'user', content: 'hello', ts: Date.now() }],
      lang:           'en',
      pendingIntent:  null,
      pendingDate:    null,
      pendingTime:    null,
      pendingSubject: null,
      lastActivity:   Date.now(),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    };
    const result = parseSession(raw);
    expect(result).not.toBeNull();
    expect(result.lang).toBe('en');
    expect(result.turns).toHaveLength(1);
  });

  test('parseSession returns null for invalid input', () => {
    expect(parseSession(null)).toBeNull();
<<<<<<< HEAD
    expect(parseSession({})).toBeNull(); // missing callSid
=======
    expect(parseSession({})).toBeNull();        // missing callSid
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(parseSession({ callSid: '' })).toBeNull(); // empty callSid
  });

  test('parseSession rejects invalid turn role', () => {
    const raw = {
<<<<<<< HEAD
      callSid: 'CA123',
      turns: [{ role: 'admin', content: 'hack', ts: Date.now() }],
=======
      callSid:      'CA123',
      turns:        [{ role: 'admin', content: 'hack', ts: Date.now() }],
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      lastActivity: Date.now(),
    };
    expect(parseSession(raw)).toBeNull();
  });

  test('session serializes and round-trips via JSON', () => {
    const original = defaultSession('CA999');
<<<<<<< HEAD
    const json = JSON.stringify(original);
    const parsed = parseSession(JSON.parse(json));
=======
    const json     = JSON.stringify(original);
    const parsed   = parseSession(JSON.parse(json));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    expect(parsed).not.toBeNull();
    expect(parsed.callSid).toBe('CA999');
  });
});
