// src/features/responder/responder.service.js — SMS auto-responder with configurable tones.
// Delegates to Ollama (local LLM) for short, stylized replies.
// Tone is selected from config.SMS_TONE or overridden per-call.

import { config } from '../../core/config.js';

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
 * Generate a toned reply using the local Ollama LLM.
 * @param {string} content  — user message
 * @param {string} [tone]   — tone key (defaults to config.SMS_TONE)
 * @returns {Promise<string>}
 */
export async function autoReply(content, tone = config.SMS_TONE) {
  const systemPrompt = TONES[tone] ?? TONES[DEFAULT_TONE];

  // Dynamic import — keeps this module usable even when ollama isn't installed.
  const { chat } = await import('../../services/ollama.client.js');
  return chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content },
    ],
    { temperature: 0.7, num_predict: 120 }
  );
}

/** @returns {string[]} */
export function getTones() {
  return Object.keys(TONES);
}
