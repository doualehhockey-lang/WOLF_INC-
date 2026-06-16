// src/features/lang/lang.service.js — Heuristic language detector.
// No API call — script detection + keyword scoring for FR / EN / ES and scripts.
// Returns BCP-47 locale strings for Twilio <Gather>/<Say>.

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
]);

const LOCALE_MAP = {
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

function _words(text) {
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
 * @returns {string}  short lang code (fr, en, es, …)
 */
export function detectLang(text) {
  if (!text) return 'fr';
  const t = text.trim();
  if (/[\u0400-\u04FF]/.test(t)) return 'ru';
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';
  if (/[\u4E00-\u9FFF]/.test(t)) return 'zh';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(t)) return 'ja';
  if (/[\u0900-\u097F]/.test(t)) return 'hi';

  const words = _words(t);
  let fr = 0,
    en = 0,
    es = 0;
  for (const w of words) {
    if (FR.has(w)) fr++;
    if (EN.has(w)) en++;
    if (ES.has(w)) es++;
  }
  if (es > fr + 1 && es > en + 1) return 'es';
  if (en > fr + 1) return 'en';
  return 'fr';
}

/**
 * BCP-47 locale for Twilio <Gather>/<Say>.
 * @param {string} lang
 * @returns {string}
 */
export function twilioLocale(lang) {
  return LOCALE_MAP[lang] ?? 'fr-FR';
}

/**
 * Normalize a language tag to a short code.
 * @param {string} lang
 * @returns {string}
 */
export function normalizeLang(lang) {
  if (!lang) return 'fr';
  const s = String(lang).toLowerCase();
  for (const code of Object.keys(LOCALE_MAP)) {
    if (s.startsWith(code)) return code;
  }
  return 'fr';
}
