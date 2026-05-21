// @ts-nocheck
// src/features/nlu/nlu.service.js — NLU orchestration with strategy fallback chain.
import { ClaudeStrategy } from './strategies/claude.strategy.js';
import { RuleBasedStrategy } from './strategies/rule-based.strategy.js';
import { buildContextualMessage } from './context.builder.js';
import { resolveImplicitReferences } from './reference.resolver.js';
import { getMissing } from './missing-fields.js';
import { resolve as resolveDateTime } from './dateparser.js';
import { normalizeIntent } from '../agent/intent.normalizer.js';
import { buildContext, getLastEntities } from '../memory/memory.service.js';
import { childLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';

const log = childLogger('nlu.service');
const CONFIDENCE_THRESHOLD = 0.3;

const _claude = new ClaudeStrategy();
const _ruleBased = new RuleBasedStrategy();

function _failResult(reason) {
  return {
    ok: false, intent: 'unknown', rawIntent: '', subject: '', date: '', time: '',
    isoDate: null, isoTime: null, iso: null, confidence: 0,
    needsClarification: false, missing: [], errors: [reason], strategy: 'none',
  };
}

export async function understand(text, callSid = null, referenceDate = new Date()) {
  if (!text?.trim()) return _failResult('empty-transcript');

  const context = callSid ? await buildContext(callSid) : '';
  const fullMessage = buildContextualMessage(text.trim(), context);

  if (context) log.debug({ callSid }, 'Memory context injected into NLU prompt');

  let nlu;
  try {
    if (config.claude.apiKey) {
      nlu = await _claude.analyze(fullMessage, { model: config.claude.model, temperature: 0.05 });
    } else {
      log.debug('No Claude API key — using rule-based NLU');
      nlu = await _ruleBased.analyze(fullMessage);
    }
  } catch (err) {
    log.warn({ err: err.message }, 'Primary NLU failed — falling back to rule-based');
    try {
      nlu = await _ruleBased.analyze(text.trim());
    } catch (fallbackErr) {
      log.error({ err: fallbackErr.message }, 'Rule-based fallback also failed');
      return _failResult(`analyze-error: ${err.message}`);
    }
  }

  nlu = await resolveImplicitReferences(nlu, text.trim(), callSid);

  if (nlu.confidence < CONFIDENCE_THRESHOLD && !nlu._resolved) {
    return {
      ok: false, intent: 'unknown', rawIntent: nlu.intent, subject: '', date: '', time: '',
      isoDate: null, isoTime: null, iso: null, confidence: nlu.confidence,
      needsClarification: true, missing: [], errors: ['low-confidence'], strategy: nlu.strategy,
    };
  }

  const intent = normalizeIntent(nlu.intent);
  const lastEntities = callSid ? await getLastEntities(callSid) : null;
  const rawDate = nlu.date || (lastEntities?.isoDate ?? '');
  const rawTime = nlu.time || (lastEntities?.isoTime ?? '');
  const resolved = resolveDateTime(rawDate, rawTime, referenceDate);
  const missing = getMissing(intent, resolved);

  return {
    ok: true, intent, rawIntent: nlu.intent,
    subject: nlu.subject ?? '', date: nlu.date ?? '', time: nlu.time ?? '',
    isoDate: resolved.date, isoTime: resolved.time, iso: resolved.iso,
    confidence: nlu.confidence, needsClarification: false,
    missing, errors: nlu.errors ?? [], strategy: nlu.strategy,
    _resolved: nlu._resolved,
  };
}
