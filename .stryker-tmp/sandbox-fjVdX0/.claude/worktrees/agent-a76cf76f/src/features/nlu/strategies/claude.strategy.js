// @ts-nocheck
// src/features/nlu/strategies/claude.strategy.js — Claude-powered NLU with circuit breaker.
import { NluStrategy } from './base.strategy.js';
import { callClaude } from '../../../services/claude.client.js';
import { childLogger } from '../../../core/logger.js';

const log = childLogger('claude.strategy');

const CIRCUIT = { failures: 0, openUntil: 0, THRESHOLD: 5, RECOVERY_MS: 30_000 };

function _isOpen() {
  return CIRCUIT.failures >= CIRCUIT.THRESHOLD && Date.now() < CIRCUIT.openUntil;
}

function _recordFailure() {
  CIRCUIT.failures++;
  if (CIRCUIT.failures >= CIRCUIT.THRESHOLD) {
    CIRCUIT.openUntil = Date.now() + CIRCUIT.RECOVERY_MS;
    log.warn({ openUntil: new Date(CIRCUIT.openUntil).toISOString() }, 'Claude circuit breaker OPEN');
  }
}

function _recordSuccess() {
  CIRCUIT.failures = 0;
}

function _escapeJson(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

const SYSTEM_PROMPT =
  'Tu es un extracteur NLU. Tu dois retourner UNIQUEMENT une ligne JSON valide avec les champs : ' +
  'intent (create_event|cancel_event|update_event|list_events|unknown), subject (string), ' +
  'date (string, ex: "demain", "lundi", "2026-04-10"), time (string, ex: "14h30", "09:00"), ' +
  'confidence (number 0-1), errors (array), strategy (string). ' +
  "Ne retourne rien d'autre que le JSON.";

export class ClaudeStrategy extends NluStrategy {
  async analyze(text, options = {}) {
    if (_isOpen()) throw new Error('Claude circuit breaker is open');

    const model = options.model || process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

    try {
      const res = await callClaude({
        model,
        max_tokens: 256,
        temperature: options.temperature ?? 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Texte à analyser : "${_escapeJson(text)}"` }],
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        log.warn({ status: res.status, errText: errText.slice(0, 200) }, 'Claude API error');
        _recordFailure();
        throw new Error(`Claude API ${res.status}`);
      }

      const json = await res.json();
      const raw = (json.content?.[0]?.text ?? '')
        .trim()
        .replace(/^```json?/i, '')
        .replace(/```$/, '')
        .trim();

      const parsed = JSON.parse(raw.split('\n')[0]);
      _recordSuccess();

      return {
        intent: parsed.intent || 'unknown',
        subject: parsed.subject || '',
        date: parsed.date || '',
        time: parsed.time || '',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        errors: parsed.errors || [],
        strategy: 'claude',
      };
    } catch (err) {
      _recordFailure();
      log.warn({ err: err.message }, 'Claude strategy failed');
      throw err;
    }
  }
}
