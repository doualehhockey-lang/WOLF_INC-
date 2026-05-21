// src/features/voice/pipeline.js — End-to-end voice processing pipeline.
// NLU → missing-fields check → agent dispatch → TTS → TwiML response.
// All steps are instrumented with Prometheus histograms.

import { resolve }                    from 'path';
import { childLogger }                from '../../core/logger.js';
import { config }                     from '../../core/config.js';
import { pipelineLatency, errorCounter, activeSessions } from '../../core/metrics.js';
import { isEnabled, FLAGS }           from '../../core/featureFlags.js';
import { understand }                 from '../nlu/nlu.service.js';
import { dispatch }                   from '../agent/agent.service.js';
import { synthesize }                 from '../tts/tts.service.js';
import { addUserTurn, addAgentTurn, getStats as memStats } from '../memory/memory.service.js';
import { detectLang, twilioLocale }   from '../lang/lang.service.js';
import { twimlSayThenGather, twimlError, twimlPlayThenGather } from './twiml.builder.js';

const log              = childLogger('pipeline');
const PIPELINE_TIMEOUT = 12_000; // ms — Twilio drops at 15s

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * @param {{ text: string, callSid: string, from: string }} ctx
 * @param {Function} saveAudio — (buffer, dir, ext) => Promise<{filename}>
 * @returns {Promise<string>}  TwiML XML string
 */
export async function runPipeline({ text, callSid, from }, saveAudio) {
  const userKey  = from !== 'unknown' ? from : callSid;
  const userLang = detectLang(text);
  const locale   = twilioLocale(userLang);
  const gatherUrl = `${config.BASE_URL}/twilio/gather`;
  const timer    = pipelineLatency.startTimer();

  // ── Kill switch — disable voice pipeline without restart ──────────────────
  if (!await isEnabled(FLAGS.PIPELINE_VOICE)) {
    timer({ intent: 'disabled', success: 'false' });
    log.warn({ callSid }, 'PIPELINE_VOICE flag disabled — rejecting call');
    return twimlSayThenGather('Service vocal temporairement indisponible. Veuillez rappeler plus tard.', gatherUrl, { locale });
  }

  const memoryEnabled = await isEnabled(FLAGS.MEMORY_CONTEXT);

  if (memoryEnabled) await addUserTurn(callSid, text);
  activeSessions.set(memStats().activeSessions);

  // ── NLU ───────────────────────────────────────────────────────────────────

  let nluResult;
  try {
    nluResult = await understand(text, callSid);
  } catch (err) {
    log.error({ err: err.message, callSid }, 'NLU failed');
    timer({ intent: 'nlu_error', success: 'false' });
    errorCounter.inc({ service: 'pipeline', errorType: 'nlu_error' });
    return twimlSayThenGather("Mon système d'analyse est indisponible. Veuillez rappeler.", gatherUrl, { locale });
  }

  // ── Clarification ─────────────────────────────────────────────────────────

  if (nluResult.needsClarification && !nluResult.missing?.length) {
    const msg = "Je n'ai pas bien compris. Vous pouvez me demander de créer, annuler, modifier ou consulter vos rendez-vous.";
    const translated = await _translate(msg, userLang);
    if (memoryEnabled) await addAgentTurn(callSid, translated);
    timer({ intent: 'clarification', success: 'true' });
    return _sayOrPlay(translated, locale, gatherUrl, saveAudio);
  }

  // ── Missing fields ────────────────────────────────────────────────────────

  if (nluResult.missing?.length > 0) {
    const question  = _buildMissingQuestion(nluResult);
    const translated = await _translate(question, userLang);
    if (memoryEnabled) await addAgentTurn(callSid, translated, nluResult);
    timer({ intent: nluResult.intent, success: 'true' });
    return _sayOrPlay(translated, locale, gatherUrl, saveAudio);
  }

  // ── Agent dispatch ────────────────────────────────────────────────────────

  let agentResult;
  try {
    agentResult = await dispatch(nluResult, userKey);
    log.info({ callSid, preview: agentResult.message.slice(0, 80) }, 'Agent response');
  } catch (err) {
    log.error({ err: err.message, callSid }, 'Agent failed');
    agentResult = { ok: false, message: 'Une erreur interne est survenue. Veuillez réessayer.' };
  }

  let responseMessage = agentResult.message;
  if (userLang !== 'fr') responseMessage = await _translate(responseMessage, userLang);

  if (memoryEnabled) await addAgentTurn(callSid, responseMessage, nluResult);
  timer({ intent: nluResult.intent, success: String(agentResult.ok) });
  return _sayOrPlay(responseMessage, locale, gatherUrl, saveAudio);
}

/**
 * Wrap pipeline execution with a hard timeout.
 * @param {Function} fn
 * @param {string}   gatherUrl
 * @param {string}   locale
 */
export function withTimeout(fn, gatherUrl, locale = 'fr-FR') {
  return Promise.race([
    fn(),
    new Promise(resolve => {
      const t = setTimeout(() => resolve(
        twimlSayThenGather('Je traite encore votre demande, veuillez patienter.', gatherUrl, { locale })
      ), PIPELINE_TIMEOUT);
      t.unref(); // don't prevent process exit when the race resolves first
    }),
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _sayOrPlay(text, locale, gatherUrl, saveAudio) {
  try {
    const ttsResult  = await synthesize(text, locale);
    const { filename } = await saveAudio(ttsResult.buffer, resolve(config.AUDIO_DIR), ttsResult.ext);
    const url        = `${config.BASE_URL}/audio/${filename}`;
    return twimlPlayThenGather(url, gatherUrl, { locale });
  } catch (err) {
    log.error({ err: err.message }, 'TTS/save failed — falling back to <Say>');
    errorCounter.inc({ service: 'tts', errorType: err.code ?? 'unknown' });
    return twimlSayThenGather(text, gatherUrl, { locale });
  }
}

async function _translate(text, lang) {
  if (lang === 'fr') return text;
  // Kill switch — bypass translation without restart
  if (!await isEnabled(FLAGS.TRANSLATION)) return text;
  try {
    const { translate } = await import('../../services/claude.client.js');
    return translate(text, lang);
  } catch {
    return text; // fail open — untranslated is better than no response
  }
}

function _buildMissingQuestion({ intent, missing, subject }) {
  const subj = subject ? ` (${subject})` : '';
  if (intent === 'create_event') {
    if (missing.includes('date') && missing.includes('heure'))
      return `Pour quel jour et à quelle heure souhaitez-vous créer ce rendez-vous${subj} ?`;
    if (missing.includes('date'))
      return `Pour quel jour souhaitez-vous ce rendez-vous${subj} ?`;
    if (missing.includes('heure'))
      return `À quelle heure souhaitez-vous ce rendez-vous${subj} ?`;
  }
  if (intent === 'cancel_event') return 'Quel rendez-vous souhaitez-vous annuler ? Précisez la date.';
  if (intent === 'update_event') return 'Quel rendez-vous souhaitez-vous modifier ? Précisez la date.';
  return 'Pouvez-vous préciser votre demande ?';
}
