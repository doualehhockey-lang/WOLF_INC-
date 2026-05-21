// @ts-nocheck
// responder.js — Auto-répondeur avec tons configurables
// Optimisé pour des réponses courtes, naturelles et stylées (< 30 tokens système).
'use strict';

import { chat } from './ollama.js';

// ═══════════════════════════════════════════════════════════
// TONS CONFIGURABLES
// ═══════════════════════════════════════════════════════════

export const TONES = {
  pro:
    'Tu es un assistant professionnel, courtois et direct. ' +
    "Réponds dans la même langue que le message de l'utilisateur en 1-2 phrases, sans formules inutiles.",

  sec:
    'Tu es un assistant factuel et minimaliste. ' +
    "Réponds dans la même langue que le message de l'utilisateur en une phrase. Pas de politesse, que l'essentiel.",

  friendly:
    'Tu es un assistant chaleureux et naturel. ' +
    "Réponds dans la même langue que le message de l'utilisateur de façon sympa et concise.",

  sarcastique:
    'Tu es un assistant sarcastique et ironique. ' +
    "Réponds dans la même langue que le message de l'utilisateur avec une pointe d'humour acéré, en une phrase.",

  'wolf-inc':
    'Tu es un assistant agressif, direct et sûr de lui. ' +
    "Réponds dans la même langue que le message de l'utilisateur sans détour. Style entrepreneur qui ne perd pas de temps.",
};

export const DEFAULT_TONE = 'friendly';

// ═══════════════════════════════════════════════════════════
// API PUBLIQUE
// ═══════════════════════════════════════════════════════════

/**
 * Génère une réponse stylée au message entrant.
 * @param {string} content  - message de l'utilisateur
 * @param {string} [tone]   - clé de ton (voir TONES)
 * @returns {Promise<string>}
 */
export async function autoReply(content, tone = DEFAULT_TONE) {
  const systemPrompt = TONES[tone] ?? TONES[DEFAULT_TONE];

  return chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    { temperature: 0.7, num_predict: 120 }
  );
}

/**
 * @returns {string[]} Liste des tons disponibles
 */
export function getTones() {
  return Object.keys(TONES);
}
