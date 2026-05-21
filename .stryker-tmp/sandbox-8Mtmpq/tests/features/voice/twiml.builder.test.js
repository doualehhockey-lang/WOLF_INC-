// @ts-nocheck
// tests/features/voice/twiml.builder.test.js

import {
  twimlPlayThenGather,
  twimlSayThenGather,
  twimlGather,
  twimlError,
} from '../../../src/features/voice/twiml.builder.js';

describe('twiml.builder', () => {
  const GATHER_URL = 'http://localhost:3000/twilio/gather';
  const AUDIO_URL  = 'http://localhost:3000/audio/tts_123.wav';

  test('twimlPlayThenGather produces valid XML with <Play>', () => {
    const xml = twimlPlayThenGather(AUDIO_URL, GATHER_URL);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<Play>');
    expect(xml).toContain(AUDIO_URL);
    expect(xml).toContain('<Gather');
    expect(xml).toContain(GATHER_URL);
  });

  test('twimlSayThenGather produces valid XML with <Say>', () => {
    const xml = twimlSayThenGather('Bonjour', GATHER_URL, { locale: 'fr-FR' });
    expect(xml).toContain('<Say');
    expect(xml).toContain('Bonjour');
    expect(xml).toContain('fr-FR');
  });

  test('twimlGather produces prompt inside <Gather>', () => {
    const xml = twimlGather('Comment puis-je vous aider ?', GATHER_URL);
    expect(xml).toContain('Comment puis-je vous aider');
    expect(xml).toContain('<Gather');
  });

  test('twimlError with gatherUrl produces Say+Gather', () => {
    const xml = twimlError(GATHER_URL, 'fr-FR');
    expect(xml).toContain('<Gather');
    expect(xml).toContain('erreur');
  });

  test('twimlError without gatherUrl produces Hangup', () => {
    const xml = twimlError();
    expect(xml).toContain('<Hangup');
  });

  test('XML-escapes special characters in text', () => {
    const xml = twimlSayThenGather('5 < 10 & "test"', GATHER_URL);
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
  });

  test('XML-escapes special characters in URLs', () => {
    const dangerous = 'http://evil.com/?a=1&b=2<script>';
    const xml       = twimlPlayThenGather(dangerous, GATHER_URL);
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
  });
});
