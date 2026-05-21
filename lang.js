// lang.js — Language detector for multiple languages.
// No API call — heuristic script and keyword scoring.
// Returns a simplified language code for locale selection.

'use strict';

const FR = new Set([
  'bonjour',
  'bonsoir',
  'salut',
  'merci',
  'oui',
  'non',
  'je',
  'tu',
  'il',
  'elle',
  'nous',
  'vous',
  'ils',
  'elles',
  'un',
  'une',
  'le',
  'la',
  'les',
  'de',
  'du',
  'des',
  'et',
  'est',
  'avec',
  'pour',
  'sur',
  'dans',
  'rendez',
  'annuler',
  'créer',
  'creer',
  'modifier',
  'agenda',
  'demain',
  'aujourd',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
  'heure',
  'heures',
  'réunion',
  'reunion',
  'rendez-vous',
  'supprimer',
  'ajouter',
  'liste',
  'quels',
  'afficher',
  'prochain',
  'prochaine',
  'semaine',
  'mois',
  'annulation',
  'déplacer',
  'deplacer',
  'changer',
  'nouveau',
  'nouvelle',
  'mon',
  'ma',
  'mes',
  'votre',
  'vos',
  'leur',
  'leurs',
]);

const EN = new Set([
  'hello',
  'hi',
  'hey',
  'yes',
  'no',
  'please',
  'thank',
  'thanks',
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'it',
  'my',
  'your',
  'create',
  'book',
  'schedule',
  'add',
  'cancel',
  'delete',
  'remove',
  'update',
  'change',
  'move',
  'reschedule',
  'list',
  'show',
  'what',
  'display',
  'get',
  'check',
  'appointment',
  'meeting',
  'call',
  'event',
  'today',
  'tomorrow',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'next',
  'week',
  'month',
  'time',
  'at',
  'on',
  'for',
  'with',
  'about',
  'new',
  'cancel',
]);

const ES = new Set([
  'hola',
  'buenos',
  'buenas',
  'gracias',
  'por',
  'favor',
  'sí',
  'si',
  'no',
  'quiero',
  'deseo',
  'reservar',
  'agenda',
  'cita',
  'citas',
  'reunión',
  'reunion',
  'mañana',
  'manana',
  'hoy',
  'lunes',
  'martes',
  'miércoles',
  'miercoles',
  'jueves',
  'viernes',
  'sábado',
  'sabado',
  'domingo',
  'crear',
  'añadir',
  'anadir',
  'cancelar',
  'eliminar',
  'borrar',
  'modificar',
  'cambiar',
  'lista',
  'mostrar',
  'ver',
  'consultar',
  'evento',
  'reuniones',
  'semana',
  'mes',
  'hora',
  'las',
  'a',
  'en',
]);

const LocaleMap = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  ru: 'ru-RU',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ar: 'ar-SA',
  hi: 'hi-IN',
};

function hasScript(text, regex) {
  return regex.test(text);
}

function normalizedWords(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s\W]+/)
    .filter(Boolean);
}

/**
 * Detect the language of a text string.
 * @param {string} text
 * @returns {string}
 */
export function detectLang(text) {
  if (!text) return 'fr';

  const trimmed = text.trim();
  if (hasScript(trimmed, /[\u0400-\u04FF]/)) return 'ru';
  if (hasScript(trimmed, /[\u0600-\u06FF]/)) return 'ar';
  if (hasScript(trimmed, /[\u4E00-\u9FFF]/)) return 'zh';
  if (hasScript(trimmed, /[\u3040-\u309F\u30A0-\u30FF]/)) return 'ja';
  if (hasScript(trimmed, /[\u0900-\u097F]/)) return 'hi';

  const words = normalizedWords(trimmed);
  let fr = 0;
  let en = 0;
  let es = 0;

  for (const w of words) {
    if (FR.has(w)) fr++;
    if (EN.has(w)) en++;
    if (ES.has(w)) es++;
  }

  if (es > fr + 1 && es > en + 1) return 'es';
  if (en > fr + 1) return 'en';
  if (fr > en + 1) return 'fr';

  return 'fr';
}

/**
 * Returns the BCP-47 locale string for Twilio <Gather> / <Say>.
 * @param {string} lang
 * @returns {string}
 */
export function twilioLocale(lang) {
  return LocaleMap[lang] || 'fr-FR';
}

/**
 * Normalize language code to a short code.
 * @param {string} lang
 * @returns {string}
 */
export function normalizeLang(lang) {
  if (!lang) return 'fr';
  const safe = String(lang).toLowerCase();
  if (safe.startsWith('fr')) return 'fr';
  if (safe.startsWith('en')) return 'en';
  if (safe.startsWith('es')) return 'es';
  if (safe.startsWith('de')) return 'de';
  if (safe.startsWith('it')) return 'it';
  if (safe.startsWith('pt')) return 'pt';
  if (safe.startsWith('ru')) return 'ru';
  if (safe.startsWith('ja')) return 'ja';
  if (safe.startsWith('zh')) return 'zh';
  if (safe.startsWith('ar')) return 'ar';
  if (safe.startsWith('hi')) return 'hi';
  return 'fr';
}
