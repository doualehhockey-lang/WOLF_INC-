// @ts-nocheck
import { detectLang, twilioLocale, normalizeLang } from '../lang.js';

describe('Language detection', () => {
  test('detects French text correctly', () => {
    expect(detectLang('Bonjour, je voudrais un rendez-vous demain')).toBe('fr');
  });

  test('detects English text correctly', () => {
    expect(detectLang('Hello, please show my appointments tomorrow')).toBe('en');
  });

  test('detects Spanish text correctly', () => {
    expect(detectLang('Hola, por favor muéstrame mis citas mañana')).toBe('es');
  });

  test('detects Arabic text correctly', () => {
    expect(detectLang('مرحبا أريد أن أجد مواعيدي غداً')).toBe('ar');
  });

  test('maps short languages to Twilio locale codes', () => {
    expect(twilioLocale('fr')).toBe('fr-FR');
    expect(twilioLocale('en')).toBe('en-US');
    expect(twilioLocale('es')).toBe('es-ES');
    expect(twilioLocale('ar')).toBe('ar-SA');
  });

  test('normalizeLang returns canonical short codes', () => {
    expect(normalizeLang('en-US')).toBe('en');
    expect(normalizeLang('es-ES')).toBe('es');
    expect(normalizeLang('ar-SA')).toBe('ar');
    expect(normalizeLang('fr')).toBe('fr');
  });
});
