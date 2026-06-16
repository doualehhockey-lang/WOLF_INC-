// src/features/voice/pipeline.js — End-to-end voice processing pipeline.
// Two modes:
//   1. Conversational (default): Claude thinks freely and uses calendar tools.
//      Like talking to ChatGPT — has personality, free will, natural responses.
//   2. Structured fallback: NLU → intent → agent dispatch → template response.
//      Used when Claude API is unavailable (circuit open, no API key).
// All steps are instrumented with Prometheus histograms.

import { resolve } from 'path';
import { childLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
import { pipelineLatency, errorCounter, activeSessions } from '../../core/metrics.js';
import { isEnabled, FLAGS } from '../../core/featureFlags.js';
import { understand } from '../nlu/nlu.service.js';
import { dispatch } from '../agent/agent.service.js';
import { synthesize } from '../tts/tts.service.js';
import { converse } from './conversation.service.js';
import {
  addUserTurn,
  addAgentTurn,
  getSession,
  getStats as memStats,
} from '../memory/memory.service.js';
import { detectLang, twilioLocale } from '../lang/lang.service.js';
import { twimlSayThenGather, twimlPlayThenGather } from './twiml.builder.js';

const log = childLogger('pipeline');
const PIPELINE_TIMEOUT = 10_000; // ms — hard cutoff; Twilio drops at ~15s, leaving 5s margin
const TTS_TIMEOUT = 4_000; // ms — TTS must finish within budget; fallback to <Say> on miss

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * @param {{ text: string, callSid: string, from: string }} ctx
 * @param {Function} saveAudio — (buffer, dir, ext) => Promise<{filename}>
 * @returns {Promise<string>}  TwiML XML string
 */
export async function runPipeline({ text, callSid, from }, saveAudio) {
  const userKey = from !== 'unknown' ? from : callSid;
  const userLang = detectLang(text);
  const locale = twilioLocale(userLang);
  const gatherUrl = `${config.BASE_URL}/twilio/gather`;
  const timer = pipelineLatency.startTimer();

  // ── Kill switch — disable voice pipeline without restart ──────────────────
  if (!(await isEnabled(FLAGS.PIPELINE_VOICE))) {
    timer({ intent: 'disabled', success: 'false' });
    log.warn({ callSid }, 'PIPELINE_VOICE flag disabled — rejecting call');
    return twimlSayThenGather(
      'Service vocal temporairement indisponible. Veuillez rappeler plus tard.',
      gatherUrl,
      { locale }
    );
  }

  const memoryEnabled = await isEnabled(FLAGS.MEMORY_CONTEXT);

  if (memoryEnabled) await addUserTurn(callSid, text);
  activeSessions.set(memStats().activeSessions);

  // ── Conversational mode (primary) ─────────────────────────────────────────
  // Claude thinks freely, responds naturally, uses tools when needed.
  // Falls back to structured pipeline only if conversation fails.

  try {
    const session = memoryEnabled ? await getSession(callSid) : { turns: [] };
    const history = session.turns.map(t => ({
      role: t.role === 'user' ? 'user' : 'assistant',
      content: t.content,
    }));

    const { response, toolsUsed } = await converse(text, history, userKey);

    log.info(
      { callSid, preview: response.slice(0, 80), tools: toolsUsed },
      'Conversational response'
    );

    if (memoryEnabled) await addAgentTurn(callSid, response);
    timer({ intent: toolsUsed[0] ?? 'conversation', success: 'true' });
    return _sayOrPlay(response, locale, gatherUrl, saveAudio);
  } catch (converseErr) {
    log.warn(
      { err: converseErr.message, callSid },
      'Conversational mode failed — structured fallback'
    );
  }

  // ── Structured fallback (NLU → agent → template) ──────────────────────────
  // Only reached if conversational mode completely fails.

  return _structuredFallback({
    text,
    callSid,
    from,
    userKey,
    userLang,
    locale,
    gatherUrl,
    timer,
    memoryEnabled,
    saveAudio,
  });
}

/** Structured pipeline: NLU → intent → agent dispatch → template response. */
async function _structuredFallback({
  text,
  callSid,
  userKey,
  userLang,
  locale,
  gatherUrl,
  timer,
  memoryEnabled,
  saveAudio,
}) {
  let nluResult;
  try {
    nluResult = await understand(text, callSid);
  } catch (err) {
    log.error({ err: err.message, callSid }, 'NLU failed');
    timer({ intent: 'nlu_error', success: 'false' });
    errorCounter.inc({ service: 'pipeline', errorType: 'nlu_error' });
    return twimlSayThenGather(
      'Je suis désolée, notre système rencontre un problème. Pourriez-vous rappeler dans quelques instants ?',
      gatherUrl,
      { locale }
    );
  }

  if (nluResult.needsClarification && !nluResult.missing?.length) {
    const msg =
      "Excusez-moi, je n'ai pas bien compris. Vous pouvez me demander de prendre, annuler, modifier ou vérifier un rendez-vous.";
    const translated = await _translate(msg, userLang);
    if (memoryEnabled) await addAgentTurn(callSid, translated);
    timer({ intent: 'clarification', success: 'true' });
    return _sayOrPlay(translated, locale, gatherUrl, saveAudio);
  }

  if (nluResult.missing?.length > 0) {
    const question = _buildMissingQuestion(nluResult);
    const translated = await _translate(question, userLang);
    if (memoryEnabled) await addAgentTurn(callSid, translated, nluResult);
    timer({ intent: nluResult.intent, success: 'true' });
    return _sayOrPlay(translated, locale, gatherUrl, saveAudio);
  }

  let agentResult;
  try {
    agentResult = await dispatch(nluResult, userKey);
  } catch (err) {
    log.error({ err: err.message, callSid }, 'Agent failed');
    agentResult = {
      ok: false,
      message: 'Je suis désolée, un problème est survenu. Pourriez-vous répéter votre demande ?',
    };
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
export function withTimeout(fn, gatherUrl, locale = config.VOICE_DEFAULT_LOCALE) {
  return Promise.race([
    fn(),
    new Promise(resolve => {
      const t = setTimeout(
        () =>
          resolve(
            twimlSayThenGather("Un instant s'il vous plaît, je vérifie ça pour vous.", gatherUrl, {
              locale,
            })
          ),
        PIPELINE_TIMEOUT
      );
      t.unref(); // don't prevent process exit when the race resolves first
    }),
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _sayOrPlay(text, locale, gatherUrl, saveAudio) {
  try {
    // Hard TTS timeout: if synthesis takes longer than TTS_TIMEOUT, fall back to
    // <Say> so the overall PIPELINE_TIMEOUT budget isn't consumed waiting for TTS.
    const ttsResult = await Promise.race([
      synthesize(text, locale),
      new Promise((_, reject) => {
        const t = setTimeout(
          () => reject(Object.assign(new Error('TTS synthesis timeout'), { code: 'TTS_TIMEOUT' })),
          TTS_TIMEOUT
        );
        if (t.unref) t.unref();
      }),
    ]);
    const { filename } = await saveAudio(
      ttsResult.buffer,
      resolve(config.AUDIO_DIR),
      ttsResult.ext
    );
    const url = `${config.BASE_URL}/audio/${filename}`;
    return twimlPlayThenGather(url, gatherUrl, { locale });
  } catch (err) {
    log.error({ err: err.message }, 'TTS/save failed — falling back to <Say>');
    errorCounter.inc({ service: 'tts', errorType: err.code ?? 'unknown' });
    return twimlSayThenGather(text, gatherUrl, { locale });
  }
}

async function _translate(text, lang) {
  if (lang === 'fr') return text; // source language is French — no translation needed
  // Kill switch — bypass translation without restart
  if (!(await isEnabled(FLAGS.TRANSLATION))) return text;
  try {
    const { translate } = await import('../../services/claude.client.js');
    return translate(text, lang);
  } catch {
    return text; // fail open — untranslated is better than no response
  }
}

function _buildMissingQuestion({ intent, missing, subject }) {
  const subj = subject ? ` pour ${subject}` : '';
  if (intent === 'create_event') {
    // Support both 'heure' (NLU internal) and 'time' as field names.
    const needsDate = missing.includes('date');
    const needsTime = missing.includes('heure') || missing.includes('time');
    if (needsDate && needsTime)
      return `Bien sûr${subj}. Quel jour et à quelle heure souhaiteriez-vous votre rendez-vous ?`;
    if (needsDate) return `D'accord${subj}. Quel jour vous conviendrait le mieux ?`;
    if (needsTime) return `Très bien${subj}. À quelle heure souhaiteriez-vous venir ?`;
  }
  if (intent === 'cancel_event')
    return 'Bien sûr. Quel rendez-vous souhaitez-vous annuler ? Pourriez-vous me préciser la date ?';
  if (intent === 'update_event')
    return "D'accord. Quel rendez-vous souhaitez-vous modifier ? Pourriez-vous me donner la date ?";
  return 'Excusez-moi, pourriez-vous préciser votre demande ?';
}
