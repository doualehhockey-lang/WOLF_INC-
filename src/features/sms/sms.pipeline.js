// src/features/sms/sms.pipeline.js — SMS processing pipeline.
// SMS equivalent of voice pipeline: NLU → agent dispatch → text reply.
// No TTS needed — returns plain text for <Message> TwiML.

import { childLogger } from '../../core/logger.js';
import { understand } from '../nlu/nlu.service.js';
import { dispatch } from '../agent/agent.service.js';
import { t } from '../../core/i18n.js';

const log = childLogger('sms-pipeline');

/**
 * Process an incoming SMS through NLU and agent dispatch.
 * @param {{ text: string, from: string, sid: string }} ctx
 * @returns {Promise<string>} reply text
 */
export async function runSmsPipeline({ text, from, sid }) {
  const userKey = from !== 'unknown' ? from : sid;

  try {
    const nluResult = await understand(text, sid);
    const intent = nluResult?.intent;

    if (!intent || intent === 'unknown') {
      return t('agent.clarify', {}, 'fr');
    }

    const result = await dispatch(nluResult, userKey, 'fr', {
      phoneNumber: from,
      callSid: sid,
    });

    return result.text || t('agent.generic_ok', {}, 'fr');
  } catch (err) {
    log.error({ err: err.message, sid }, 'SMS pipeline failed');
    return 'Une erreur est survenue. Veuillez réessayer.';
  }
}
