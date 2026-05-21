import {
  twimlPlayThenGather,
  twimlSayThenGather,
  twimlGather,
  twimlError,
} from '../../utils/twilio.js';

describe('Twilio TwiML locale generation', () => {
  test('twimlPlayThenGather uses requested locale', () => {
    const xml = twimlPlayThenGather('https://example.com/audio.wav', 'https://example.com/gather', {
      locale: 'en-US',
    });
    expect(xml).toContain('language="en-US"');
  });

  test('twimlSayThenGather uses requested locale', () => {
    const xml = twimlSayThenGather('Hello world', 'https://example.com/gather', {
      locale: 'es-ES',
    });
    expect(xml).toContain('language="es-ES"');
    expect(xml).toContain('No escuché tu respuesta. Adiós.');
  });

  test('twimlGather returns localized prompts for Arabic locale', () => {
    const xml = twimlGather('مرحبا', 'https://example.com/gather', { locale: 'ar-SA' });
    expect(xml).toContain('language="ar-SA"');
    expect(xml).toContain('لم نتلقَ ردك');
  });

  test('twimlError returns localized error messages', () => {
    const xml = twimlError('https://example.com/gather', 'es-ES');
    expect(xml).toContain('language="es-ES"');
    expect(xml).toContain('Lo siento, ocurrió un error');
  });
});
