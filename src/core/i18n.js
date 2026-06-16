// src/core/i18n.js — Lightweight i18n middleware and translation helper.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { childLogger } from './logger.js';

const log = childLogger('i18n');

// Load locale files
const LOCALES_DIR = resolve('locales');
const _cache = {};

function _loadLocale(lang) {
  if (_cache[lang]) return _cache[lang];
  try {
    const data = readFileSync(resolve(LOCALES_DIR, lang, 'common.json'), 'utf8');
    _cache[lang] = JSON.parse(data);
    return _cache[lang];
  } catch {
    return {};
  }
}

// Pre-load available locales
const SUPPORTED = ['en', 'fr', 'es', 'ar', 'zh', 'ru', 'ja', 'hi'];
for (const lang of SUPPORTED) _loadLocale(lang);

log.info({ module: 'i18n', langs: SUPPORTED }, 'i18n initialized');

/**
 * Express middleware — parses Accept-Language and sets req.lang.
 */
export function i18nMiddleware(req, _res, next) {
  const accept = req.headers['accept-language'] ?? '';
  const primary = accept.split(',')[0]?.split('-')[0]?.toLowerCase() || 'fr';
  req.lang = SUPPORTED.includes(primary) ? primary : 'fr';
  next();
}

/**
 * Translate a key with optional interpolation.
 * @param {string} key   — dot-separated key, e.g. 'agent.event_created'
 * @param {object} params — interpolation values, e.g. { date: '2024-01-01' }
 * @param {string} lang   — locale code, defaults to 'fr'
 */
export function t(key, params = {}, lang = 'fr') {
  const dict = _loadLocale(lang) || _loadLocale('fr') || {};
  const parts = key.split('.');
  let val = dict;
  for (const p of parts) {
    val = val?.[p];
    if (val === undefined) break;
  }
  if (typeof val !== 'string') return key;
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '');
}
