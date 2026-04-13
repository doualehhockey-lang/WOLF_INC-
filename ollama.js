// ollama.js — Client HTTP minimal pour Ollama
// Utilisé par le NLU (analyse) ET le responder (génération libre).
'use strict';

import { config } from './env.js';

/**
 * Envoie un tableau de messages à Ollama et retourne la réponse textuelle.
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object}  [options]
 * @param {string}  [options.model]        - surcharge le modèle de config
 * @param {number}  [options.temperature]  - défaut 0.7
 * @returns {Promise<string>}
 */
export async function chat(messages, options = {}) {
  const model       = options.model       ?? config.ollama.model;
  const temperature = options.temperature ?? 0.7;
  const num_predict = options.num_predict ?? -1; // -1 = illimité (défaut Ollama)

  const res = await fetch(`${config.ollama.url}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      model,
      messages,
      stream:  false,
      options: { temperature, num_predict },
    }),
    signal: AbortSignal.timeout(config.ollama.timeout),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.message?.content?.trim() ?? '';
}
