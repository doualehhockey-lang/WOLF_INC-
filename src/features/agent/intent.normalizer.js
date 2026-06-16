// src/features/agent/intent.normalizer.js — Map raw LLM intents to canonical keys.
// All comparisons are lower-case, accent-stripped, regex-based.
// Returns 'unknown' for anything that does not match — never throws.

const PATTERNS = [
<<<<<<< HEAD
  {
    intent: 'create_event',
    re: /creat|creer|new|ajout|ajouter|nouveau|nouvel|planif|book|schedul/,
  },
  { intent: 'cancel_event', re: /cancel|annul|supprim|delet|supprimer|efface|retir/ },
  { intent: 'update_event', re: /update|modif|change|déplace|deplace|repousse|reschedul|déplacer/ },
  { intent: 'list_events', re: /list|agenda|lister|affich|show|display|voir|quels|choix/ },
=======
  { intent: 'create_event', re: /creat|creer|new|ajout|ajouter|nouveau|nouvel|planif|book|schedul/ },
  { intent: 'cancel_event', re: /cancel|annul|supprim|delet|supprimer|efface|retir/ },
  { intent: 'update_event', re: /update|modif|change|déplace|deplace|repousse|reschedul|déplacer/ },
  { intent: 'list_events',  re: /list|agenda|lister|affich|show|display|voir|quels|choix/ },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
];

/**
 * Normalize a raw intent string to a canonical intent key.
 * @param {string|null|undefined} raw
 * @returns {'create_event'|'cancel_event'|'update_event'|'list_events'|'unknown'}
 */
export function normalizeIntent(raw) {
  if (!raw) return 'unknown';

  const normalized = String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const { intent, re } of PATTERNS) {
    if (re.test(normalized)) return intent;
  }
  return 'unknown';
}
