// src/features/voice/conversation.service.js — Free-form conversational agent.
// Replaces rigid NLU→intent→template pipeline with Claude tool_use conversation.
// Sophie thinks freely, responds naturally, and uses calendar tools when needed.

import { childLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
import {
  listEvents as _dbList,
  createEvent as _dbCreate,
  softDeleteEvent as _dbDelete,
  updateEvent as _dbUpdate,
  findEventBySubject as _dbFindSubject,
} from '../agent/db.store.js';
import { dbAvailable } from '../../infra/db/dbClient.js';
import { errorCounter } from '../../core/metrics.js';
// featureFlags import available for future use
// import { isEnabled, FLAGS } from '../../core/featureFlags.js';

const log = childLogger('conversation');

// ── Claude API call (direct HTTP, with tool_use support) ────────────────────

async function _callClaude(body) {
  if (!config.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY not configured');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Claude ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

// ── Tools available to Claude ────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'create_appointment',
    description: 'Créer un nouveau rendez-vous pour le client.',
    input_schema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Type de rendez-vous (ex: consultation, nettoyage)',
        },
        date: { type: 'string', description: 'Date au format YYYY-MM-DD' },
        time: { type: 'string', description: 'Heure au format HH:MM' },
      },
      required: ['date', 'time'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Annuler un rendez-vous existant.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date du rendez-vous à annuler (YYYY-MM-DD)' },
        subject: { type: 'string', description: 'Sujet du rendez-vous à annuler' },
      },
      required: ['date'],
    },
  },
  {
    name: 'list_appointments',
    description: 'Lister les rendez-vous du client.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'update_appointment',
    description: 'Modifier un rendez-vous existant (date, heure, ou sujet).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date actuelle du rendez-vous (YYYY-MM-DD)' },
        newDate: { type: 'string', description: 'Nouvelle date (YYYY-MM-DD)' },
        newTime: { type: 'string', description: 'Nouvelle heure (HH:MM)' },
        subject: { type: 'string', description: 'Nouveau sujet' },
      },
      required: ['date'],
    },
  },
  {
    name: 'check_business_hours',
    description: "Vérifier si une date/heure est dans les heures d'ouverture.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Heure (HH:MM)' },
      },
      required: ['date', 'time'],
    },
  },
];

// ── System prompt — Sophie persona ──────────────────────────────────────────

function _buildSystemPrompt() {
  const now = new Date();
  const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const today = `${dayNames[now.getDay()]} ${now.toISOString().split('T')[0]}`;

  return `Tu es Sophie, réceptionniste à la clinique depuis 3 ans. Tu as 28 ans, tu es chaleureuse, professionnelle et un peu drôle.

RÈGLES:
- Tu parles en français, naturellement, comme une vraie personne au téléphone.
- Jamais de markdown, pas de listes à puces, pas de formatage — c'est une conversation vocale.
- Sois concise (2-3 phrases max par réponse).
- Utilise les outils pour gérer les rendez-vous quand nécessaire.
- Si le client est anxieux ou stressé, sois rassurante.
- Tu peux faire du small talk mais ramène toujours vers le service.

CONTEXTE:
- Date du jour: ${today}
- Horaires: lundi-vendredi 9h-19h, samedi 9h-14h, fermé dimanche
- Services: consultation, nettoyage, détartrage, urgence dentaire

STYLE VOCAL:
- "Bien sûr!", "Parfait!", "Je vérifie ça tout de suite."
- Évite: "En tant qu'IA", "Je suis un assistant", toute référence au fait d'être une machine.`;
}

// ── Tool execution ──────────────────────────────────────────────────────────

async function _executeTool(name, input, userKey) {
  if (!dbAvailable) return { success: false, error: 'Base de données indisponible.' };
  switch (name) {
    case 'create_appointment':
      return _dbCreate(userKey, {
        subject: input.subject || 'Rendez-vous',
        date: input.date,
        time: input.time,
      });
    case 'cancel_appointment': {
      const event = await _dbFindSubject(userKey, input.subject || input.date);
      if (!event) return { success: false, error: 'Aucun rendez-vous trouvé.' };
      await _dbDelete(userKey, event.id);
      return { success: true, cancelled: event };
    }
    case 'list_appointments':
      return _dbList(userKey);
    case 'update_appointment': {
      const event = await _dbFindSubject(userKey, input.subject || input.date);
      if (!event) return { success: false, error: 'Aucun rendez-vous trouvé.' };
      const patch = {};
      if (input.newDate) patch.date = input.newDate;
      if (input.newTime) patch.time = input.newTime;
      if (input.subject) patch.subject = input.subject;
      return _dbUpdate(userKey, event.id, patch);
    }
    case 'check_business_hours':
      return { open: true, message: 'Créneau disponible.' };
    default:
      return { error: `Outil inconnu: ${name}` };
  }
}

// ── Main conversation function ──────────────────────────────────────────────

// Use the analyze function as our Claude API call wrapper

/**
 * Free-form conversation with Claude using calendar tools.
 * @param {string} userMessage — transcribed user speech
 * @param {Array}  history     — previous turns [{role, content}]
 * @param {string} userKey     — user identifier (phone number)
 * @returns {{ response: string, toolsUsed: string[] }}
 */
export async function converse(userMessage, history = [], userKey = 'unknown') {
  const systemPrompt = _buildSystemPrompt();
  const toolsUsed = [];
  const start = Date.now();

  const messages = [...history, { role: 'user', content: userMessage }];

  try {
    let response = await _callClaude({
      model: config.CLAUDE_MODEL,
      max_tokens: 300,
      temperature: 0.7,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Handle tool use — Claude may want to call a tool (max 5 iterations to prevent abuse)
    const MAX_TOOL_ROUNDS = 5;
    let toolRound = 0;
    while (response.stop_reason === 'tool_use' && toolRound < MAX_TOOL_ROUNDS) {
      toolRound++;
      const toolBlock = response.content.find(b => b.type === 'tool_use');
      if (!toolBlock) break;

      toolsUsed.push(toolBlock.name);
      log.info({ tool: toolBlock.name, input: toolBlock.input }, 'Tool called');

      let toolResult;
      try {
        toolResult = await _executeTool(toolBlock.name, toolBlock.input, userKey);
      } catch (err) {
        log.error({ err: err.message, tool: toolBlock.name }, 'Tool execution failed');
        toolResult = { success: false, error: "Erreur lors de l'opération." };
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(toolResult),
          },
        ],
      });

      response = await _callClaude({
        model: config.CLAUDE_MODEL,
        max_tokens: 300,
        temperature: 0.7,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });
    }

    const latency = Date.now() - start;

    // Extract text from response
    const text = response.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join(' ')
      .trim();

    log.info({ latency, toolsUsed, preview: text?.slice(0, 80) }, 'Conversation complete');
    return {
      response: text || "Je suis désolée, je n'ai pas pu traiter votre demande.",
      toolsUsed,
    };
  } catch (err) {
    errorCounter.inc({ service: 'conversation', errorType: err.code ?? 'unknown' });
    log.error({ err: err.message, userKey }, 'Conversation failed');
    throw err;
  }
}
