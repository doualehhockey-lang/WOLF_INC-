// @ts-nocheck
// tests/features/lang/lang.service.extended.test.js
// Extended coverage: normalizeLang (the missing lines 60-65), edge cases,
// script detection, multi-language scoring, twilioLocale fallback.

import {
  detectLang,
  twilioLocale,
  normalizeLang,
} from '../../../src/features/lang/lang.service.js';

// ═════════════════════════════════════════════════════════════════════════════
// normalizeLang — lines 60-65 (the uncovered function)
// ═════════════════════════════════════════════════════════════════════════════

describe('normalizeLang', () => {
  test('returns "fr" for null', () => {
    expect(normalizeLang(null)).toBe('fr');
  });

  test('returns "fr" for undefined', () => {
    expect(normalizeLang(undefined)).toBe('fr');
  });

  test('returns "fr" for empty string', () => {
    expect(normalizeLang('')).toBe('fr');
  });

  test('returns "fr" for full locale "fr-FR"', () => {
    expect(normalizeLang('fr-FR')).toBe('fr');
  });

  test('returns "en" for "en-US"', () => {
    expect(normalizeLang('en-US')).toBe('en');
  });

  test('returns "en" for bare "en"', () => {
    expect(normalizeLang('en')).toBe('en');
  });

  test('returns "es" for "es-ES"', () => {
    expect(normalizeLang('es-ES')).toBe('es');
  });

  test('returns "de" for "de-DE"', () => {
    expect(normalizeLang('de-DE')).toBe('de');
  });

  test('returns "ja" for "ja-JP"', () => {
    expect(normalizeLang('ja-JP')).toBe('ja');
  });

  test('returns "zh" for "zh-CN"', () => {
    expect(normalizeLang('zh-CN')).toBe('zh');
  });

  test('returns "ar" for "ar-SA"', () => {
    expect(normalizeLang('ar-SA')).toBe('ar');
  });

  test('returns "fr" for unknown locale "xx-YY"', () => {
    expect(normalizeLang('xx-YY')).toBe('fr');
  });

  test('handles uppercase locale (lowercased internally)', () => {
    expect(normalizeLang('FR')).toBe('fr');
    expect(normalizeLang('EN-US')).toBe('en');
  });

  test('coerces numeric input to string', () => {
    // String(42).startsWith('fr') → false → returns 'fr' default
    expect(normalizeLang(42)).toBe('fr');
  });

  test('returns "it" for "it-IT"', () => {
    expect(normalizeLang('it-IT')).toBe('it');
  });

  test('returns "pt" for "pt-PT"', () => {
    expect(normalizeLang('pt-PT')).toBe('pt');
  });

  test('returns "ru" for "ru-RU"', () => {
    expect(normalizeLang('ru-RU')).toBe('ru');
  });

  test('returns "hi" for "hi-IN"', () => {
    expect(normalizeLang('hi-IN')).toBe('hi');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// detectLang — script detection edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('detectLang — Unicode script detection', () => {
  test('detects Cyrillic as Russian', () => {
    expect(detectLang('привет мир')).toBe('ru');
  });

  test('detects Arabic script', () => {
    expect(detectLang('مرحبا بالعالم')).toBe('ar');
  });

  test('detects CJK as Chinese', () => {
    expect(detectLang('你好世界')).toBe('zh');
  });

  test('detects Hiragana as Japanese', () => {
    expect(detectLang('こんにちは')).toBe('ja');
  });

  test('detects Katakana as Japanese', () => {
    expect(detectLang('コンニチハ')).toBe('ja');
  });

  test('detects Devanagari as Hindi', () => {
    expect(detectLang('नमस्ते दुनिया')).toBe('hi');
  });

  test('returns "fr" for empty string', () => {
    expect(detectLang('')).toBe('fr');
  });

  test('returns "fr" for null', () => {
    expect(detectLang(null)).toBe('fr');
  });

  test('returns "fr" for undefined', () => {
    expect(detectLang(undefined)).toBe('fr');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// detectLang — keyword scoring
// ═════════════════════════════════════════════════════════════════════════════

describe('detectLang — keyword scoring', () => {
  test('detects English with clear keywords', () => {
    expect(detectLang('hello please schedule a meeting for tomorrow')).toBe('en');
  });

  test('detects Spanish with clear keywords', () => {
    expect(detectLang('hola quiero reservar una cita mañana lunes')).toBe('es');
  });

  test('defaults to French for ambiguous text', () => {
    expect(detectLang('test 123')).toBe('fr');
  });

  test('detects French keywords', () => {
    expect(detectLang('bonjour je voudrais un rendez-vous demain')).toBe('fr');
  });

  test('English wins by margin (en > fr + 1)', () => {
    // strong English text
    expect(detectLang('hello the a is are you he she we they')).toBe('en');
  });

  test('Spanish wins by margin (es > fr+1 and es > en+1)', () => {
    expect(detectLang('hola gracias si quiero reservar lunes martes jueves viernes')).toBe('es');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// twilioLocale — fallback
// ═════════════════════════════════════════════════════════════════════════════

describe('twilioLocale', () => {
  test('returns fr-FR for "fr"', () => {
    expect(twilioLocale('fr')).toBe('fr-FR');
  });

  test('returns en-US for "en"', () => {
    expect(twilioLocale('en')).toBe('en-US');
  });

  test('returns es-ES for "es"', () => {
    expect(twilioLocale('es')).toBe('es-ES');
  });

  test('returns de-DE for "de"', () => {
    expect(twilioLocale('de')).toBe('de-DE');
  });

  test('returns fr-FR as fallback for unknown lang', () => {
    expect(twilioLocale('xx')).toBe('fr-FR');
  });

  test('returns fr-FR for undefined', () => {
    expect(twilioLocale(undefined)).toBe('fr-FR');
  });

  test('returns fr-FR for null', () => {
    expect(twilioLocale(null)).toBe('fr-FR');
  });

  test('returns ja-JP for "ja"', () => {
    expect(twilioLocale('ja')).toBe('ja-JP');
  });

  test('returns zh-CN for "zh"', () => {
    expect(twilioLocale('zh')).toBe('zh-CN');
  });

  test('returns ru-RU for "ru"', () => {
    expect(twilioLocale('ru')).toBe('ru-RU');
  });

  test('returns ar-SA for "ar"', () => {
    expect(twilioLocale('ar')).toBe('ar-SA');
  });

  test('returns hi-IN for "hi"', () => {
    expect(twilioLocale('hi')).toBe('hi-IN');
  });
});
