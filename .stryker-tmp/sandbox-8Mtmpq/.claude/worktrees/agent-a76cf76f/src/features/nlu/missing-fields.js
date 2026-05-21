// @ts-nocheck
// src/features/nlu/missing-fields.js — Determines which required fields are missing for each intent.
export function getMissing(intent, resolved) {
  const m = [];
  if (intent === 'create_event') {
    if (!resolved.hasDate) m.push('date');
    if (!resolved.hasTime) m.push('heure');
  }
  if (intent === 'cancel_event' || intent === 'update_event') {
    if (!resolved.hasDate) m.push('date');
  }
  return m;
}

export function buildMissingFieldQuestion({ intent, missing, subject }) {
  const subj = subject ? ` (${subject})` : '';
  if (intent === 'create_event') {
    if (missing.includes('date') && missing.includes('heure'))
      return `Pour quel jour et à quelle heure souhaitez-vous créer ce rendez-vous${subj} ?`;
    if (missing.includes('date')) return `Pour quel jour souhaitez-vous ce rendez-vous${subj} ?`;
    if (missing.includes('heure')) return `À quelle heure souhaitez-vous ce rendez-vous${subj} ?`;
  }
  if (intent === 'cancel_event') return 'Quel rendez-vous souhaitez-vous annuler ? Précisez la date.';
  if (intent === 'update_event') return 'Quel rendez-vous souhaitez-vous modifier ? Précisez la date.';
  return 'Pouvez-vous préciser votre demande ?';
}
