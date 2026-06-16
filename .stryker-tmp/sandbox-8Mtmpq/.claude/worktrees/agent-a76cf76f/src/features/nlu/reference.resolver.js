// @ts-nocheck
// src/features/nlu/reference.resolver.js — Resolves implicit references using conversation context.
import { childLogger } from '../../core/logger.js';
import { detectShortAnswer, getLastEntities } from '../memory/memory.service.js';

const log = childLogger('reference.resolver');

export async function resolveImplicitReferences(nlu, text, callSid) {
  if (!callSid) return nlu;

  const shortAnswer = detectShortAnswer(text);
  const lastEntities = await getLastEntities(callSid);
  if (!lastEntities) return nlu;

  if (shortAnswer === 'confirm' && lastEntities.intent) {
    log.debug({ resolved: 'confirm', intent: lastEntities.intent }, 'Implicit reference resolved');
    return {
      ...nlu,
      intent: lastEntities.intent,
      date: lastEntities.isoDate ?? nlu.date,
      time: lastEntities.isoTime ?? nlu.time,
      subject: lastEntities.subject ?? nlu.subject,
      _resolved: 'confirm',
    };
  }

  if (shortAnswer === 'deny') {
    log.debug({ resolved: 'deny' }, 'Implicit reference resolved');
    return { ...nlu, intent: 'unknown', _resolved: 'deny' };
  }

  if (nlu.intent === 'unknown' || nlu.confidence < 0.4) {
    const lower = text.toLowerCase();

    if (/annul|supprim|efface/.test(lower) && lastEntities.isoDate) {
      log.debug({ resolved: 'implicit-cancel' }, 'Implicit reference resolved');
      return {
        ...nlu,
        intent: 'cancel_event',
        date: lastEntities.isoDate,
        time: lastEntities.isoTime,
        _resolved: 'implicit-cancel',
      };
    }

    const normalised = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/change|decal|deplace|repousse|modif/.test(normalised)) {
      log.debug({ resolved: 'implicit-update' }, 'Implicit reference resolved');
      return {
        ...nlu,
        intent: 'update_event',
        date: nlu.date || lastEntities.isoDate,
        time: nlu.time || lastEntities.isoTime,
        _resolved: 'implicit-update',
      };
    }
  }

  return nlu;
}
