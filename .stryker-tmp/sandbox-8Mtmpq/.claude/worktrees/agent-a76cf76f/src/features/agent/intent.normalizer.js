// @ts-nocheck
// src/features/agent/intent.normalizer.js — Pure function to normalize raw NLU intent strings.
export function normalizeIntent(intent) {
  if (!intent) return 'unknown';
  const lower = intent.toLowerCase();
  if (/create|new|ajout|ajouter/.test(lower)) return 'create_event';
  if (/cancel|annul|supprim|delete|supprimer/.test(lower)) return 'cancel_event';
  if (/update|modif|change|déplace|deplace/.test(lower)) return 'update_event';
  if (/list|agenda|lister|choix/.test(lower)) return 'list_events';
  return lower;
}
