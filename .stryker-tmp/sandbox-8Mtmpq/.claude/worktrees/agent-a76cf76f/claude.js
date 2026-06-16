// @ts-nocheck
// claude.js — Analyse NLU via l'API Claude (Messages API)
// Fallback automatique sur règles si la clé API est absente.

import { config } from './env.js';

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

  const matchDate = lower.match(/(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d{1,2})/);
  let date = '';
  if (matchDate) {
    const d = matchDate[1];
    if (d === "aujourd'hui") date = new Date().toISOString().slice(0, 10);
    else if (d === 'demain') {
      const dt = new Date(); dt.setDate(dt.getDate() + 1);
      date = dt.toISOString().slice(0, 10);
    } else if (/\d{1,2}\/\d{1,2}/.test(d)) {
      const [day, month] = d.split('/');
      const year = new Date().getFullYear();
      date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString().slice(0, 10);
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
  if (!text || !text.trim()) {
    return {
      intent: 'unknown', subject: '', date: '', time: '',
      confidence: 0, errors: ['empty-input'], strategy: 'none',
    };
  }

  const apiKey = config.claude.apiKey || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return ruleBasedInterpretation(text);
  }

  const model = options.model || config.claude.model || 'claude-haiku-4-5-20251001';

  const systemPrompt =
    'Tu es un extracteur NLU. Tu dois retourner UNIQUEMENT une ligne JSON valide avec les champs : ' +
    'intent (create_event|cancel_event|update_event|list_events|unknown), subject (string), ' +
    'date (string, ex: "demain", "lundi", "2026-04-10"), time (string, ex: "14h30", "09:00"), ' +
    'confidence (number 0-1), errors (array), strategy (string). ' +
    'Ne retourne rien d\'autre que le JSON.';

  const userPrompt = `Texte à analyser : "${escapeJson(text)}"`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        temperature: options.temperature ?? 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[Claude] API error', res.status, errText);
      return ruleBasedInterpretation(text);
    }

    const json = await res.json();
    const raw  = json.content?.[0]?.text ?? '';
    // Extrait la première ligne JSON (ignore les éventuels backticks)
    const line = raw.trim().replace(/^```json?\s*/i, '').replace(/```$/, '').split('\n')[0];
    const parsed = JSON.parse(line);

    return {
      intent:     parsed.intent     || 'unknown',
      subject:    parsed.subject    || '',
      date:       parsed.date       || '',
      time:       parsed.time       || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      errors:     parsed.errors     || [],
      strategy:   parsed.strategy   || 'claude',
    };
  } catch (err) {
    console.warn('[Claude] fallback rule-based:', err.message);
    return ruleBasedInterpretation(text);
  }
}
