// claude.js — Analyse NLU via l'API Claude (Messages API)
// Fallback automatique sur règles si la clé API est absente.

import { config } from './env.js';
import { childLogger } from './utils/logger.js';

const log = childLogger('claude');

function escapeJson(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function ruleBasedInterpretation(text) {
  const lower = text.toLowerCase();
  let intent = 'unknown';
  if (/cr(ée|e|e un rendez|rendez-vous|rdv|ajoute)/.test(lower)) intent = 'create_event';
  else if (/annul|supprim|effac|retir/.test(lower)) intent = 'cancel_event';
  else if (/modif|change|d(é|e)place|replan|repouss/.test(lower)) intent = 'update_event';
  else if (/liste|quels|quoi|affich/.test(lower)) intent = 'list_events';

  const matchTime = lower.match(/(\d{1,2})(h|hures?)\s*(\d{0,2})?/);
  const time = matchTime ? `${matchTime[1]}:${matchTime[3] || '00'}` : '';

  const matchDate = lower.match(
    /(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d{1,2})/
  );
  let date = '';
  if (matchDate) {
    const d = matchDate[1];
    if (d === "aujourd'hui") date = new Date().toISOString().slice(0, 10);
    else if (d === 'demain') {
      const dt = new Date();
      dt.setDate(dt.getDate() + 1);
      date = dt.toISOString().slice(0, 10);
    } else if (/\d{1,2}\/\d{1,2}/.test(d)) {
      const [day, month] = d.split('/');
      const year = new Date().getFullYear();
      date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
        .toISOString()
        .slice(0, 10);
    }
  }

  const subjectMatch = lower.match(/(?:pour |avec |concernant )(.+?)(?: à | au | en | le |$)/);
  const subject = subjectMatch ? subjectMatch[1].trim() : '';

  return {
    intent,
    subject,
    date,
    time,
    confidence: intent === 'unknown' ? 0.25 : 0.85,
    errors: [],
    strategy: 'rule-based',
  };
}

export async function analyze(text, options = {}) {
  if (!text?.trim()) {
    return {
      intent: 'unknown',
      subject: '',
      date: '',
      time: '',
      confidence: 0,
      errors: ['empty-input'],
      strategy: 'none',
    };
  }

  const apiKey = config.claude.apiKey || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    log.debug('No Claude API key — using rule-based NLU');
    return ruleBasedInterpretation(text);
  }

  const model = options.model || config.claude.model || 'claude-haiku-4-5-20251001';

  const systemPrompt =
    'Tu es un extracteur NLU. Tu dois retourner UNIQUEMENT une ligne JSON valide avec les champs : ' +
    'intent (create_event|cancel_event|update_event|list_events|unknown), subject (string), ' +
    'date (string, ex: "demain", "lundi", "2026-04-10"), time (string, ex: "14h30", "09:00"), ' +
    'confidence (number 0-1), errors (array), strategy (string). ' +
    "Ne retourne rien d'autre que le JSON.";

  try {
    const res = await callClaude({
      model,
      max_tokens: 256,
      temperature: options.temperature ?? 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Texte à analyser : "${escapeJson(text)}"` }],
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      log.warn(
        { status: res.status, errText: errText.slice(0, 200) },
        'Claude API error — falling back to rule-based'
      );
      return ruleBasedInterpretation(text);
    }

    const parsed = await parseClaudeJsonResponse(res);
    if (!parsed) return ruleBasedInterpretation(text);

    return {
      intent: parsed.intent || 'unknown',
      subject: parsed.subject || '',
      date: parsed.date || '',
      time: parsed.time || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      errors: parsed.errors || [],
      strategy: parsed.strategy || 'claude',
    };
  } catch (err) {
    log.warn({ err: err.message }, 'Claude NLU failed — falling back to rule-based');
    return ruleBasedInterpretation(text);
  }
}

async function callClaude(body) {
  const apiKey = config.claude.apiKey || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('Missing Claude API key');

  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

async function parseClaudeJsonResponse(res) {
  const json = await res.json();
  const raw = json.content?.[0]?.text ?? '';
  const text = raw
    .trim()
    .replace(/^```json?/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(text.split('\n')[0]);
  } catch (err) {
    log.warn(
      { err: err.message, text: text.slice(0, 400) },
      'Failed to parse Claude JSON response'
    );
    return null;
  }
}

export async function translate(text, targetLang = 'fr') {
  if (!text?.trim()) return text;

  const apiKey = config.claude.apiKey || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    log.debug('No Claude API key — translation disabled');
    return text;
  }

  const model = config.claude.model || 'claude-haiku-4-5-20251001';
  const targetLabel = String(targetLang).toLowerCase();

  const systemPrompt =
    'Tu es un traducteur. Traduis fidèlement le texte utilisateur dans la langue cible. ' +
    'Conserve le sens, le ton et la concision originaux.';

  try {
    const res = await callClaude({
      model,
      max_tokens: 256,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Texte à traduire : "${escapeJson(text)}"\nLangue cible : ${targetLabel}`,
        },
      ],
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      log.warn(
        { status: res.status, errText: errText.slice(0, 200) },
        'Claude translate error — returning original text'
      );
      return text;
    }

    const json = await res.json();
    const translated = json.content?.[0]?.text?.trim();
    return translated || text;
  } catch (err) {
    log.warn({ err: err.message }, 'Claude translation failed — returning original text');
    return text;
  }
}
