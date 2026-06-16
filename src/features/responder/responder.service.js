// src/features/responder/responder.service.js — SMS auto-responder avec tons configurables.
// Utilise Claude pour générer des réponses courtes et stylisées.

import { config } from '../../core/config.js';
import Anthropic from '@anthropic-ai/sdk';

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

/**
 * Génère une réponse SMS stylisée avec Claude.
 * @param {string} content  — message utilisateur
 * @param {string} [tone]   — clé de ton (défaut : config.SMS_TONE)
 * @returns {Promise<string>}
 */
export async function autoReply(content, tone = config.SMS_TONE) {
  const systemPrompt = TONES[tone] ?? TONES[DEFAULT_TONE];

  const client = new Anthropic({ apiKey: config.CLAUDE_API_KEY });
  const msg = await client.messages.create({
    model: config.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });
  return msg.content[0]?.text ?? '';
}

/** @returns {string[]} */
export function getTones() {
  return Object.keys(TONES);
}
