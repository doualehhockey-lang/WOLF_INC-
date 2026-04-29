// lang.js — Fast bilingual language detector (FR / EN)
// No API call — pure heuristic word scoring.
// Returns 'fr' or 'en'. Defaults to 'fr' on ambiguity.

'use strict';

const FR = new Set([
  'bonjour','bonsoir','salut','merci','oui','non','je','tu','il','elle',
  'nous','vous','ils','elles','un','une','le','la','les','de','du','des',
  'et','est','avec','pour','sur','dans','rendez','annuler','créer','creer',
  'modifier','agenda','demain','aujourd','lundi','mardi','mercredi','jeudi',
  'vendredi','samedi','dimanche','heure','heures','réunion','reunion',
  'rendez-vous','supprimer','ajouter','liste','quels','afficher','prochain',
  'prochaine','semaine','mois','annulation','déplacer','deplacer','changer',
  'nouveau','nouvelle','mon','ma','mes','votre','vos','leur','leurs',
]);

const EN = new Set([
  'hello','hi','hey','yes','no','please','thank','thanks','the','a','an',
  'is','are','was','were','i','you','he','she','we','they','it','my','your',
  'create','book','schedule','add','cancel','delete','remove','update',
  'change','move','reschedule','list','show','what','display','get','check',
  'appointment','meeting','call','event','today','tomorrow','monday',
  'tuesday','wednesday','thursday','friday','saturday','sunday','next',
  'week','month','time','at','on','for','with','about','new','cancel',
]);

/**
 * Detect the language of a text string.
 * @param {string} text
 * @returns {'fr'|'en'}
 */
export function detectLang(text) {
  if (!text) return 'fr';

  // Strip accents for comparison so "créer" matches "creer" in the set
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const words = normalized.split(/[\s\W]+/).filter(Boolean);

  let fr = 0;
  let en = 0;

  for (const w of words) {
    if (FR.has(w)) fr++;
    if (EN.has(w)) en++;
  }

  // Need clear majority — ties go to French (original system language)
  return en > fr + 1 ? 'en' : 'fr';
}

/**
 * Returns the BCP-47 locale string for Twilio <Gather> / <Say>.
 * @param {'fr'|'en'} lang
 * @returns {string}
 */
export function twilioLocale(lang) {
  return lang === 'en' ? 'en-US' : 'fr-FR';
}
