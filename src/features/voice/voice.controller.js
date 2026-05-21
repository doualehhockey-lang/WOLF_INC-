// src/features/voice/voice.controller.js — Route handlers for Twilio voice webhooks.
// Keeps controllers thin: validate → rate-limit → delegate to pipeline.

import { childLogger }                    from '../../core/logger.js';
import { config }                         from '../../core/config.js';
import { callsTotal, activeSessions, errorCounter } from '../../core/metrics.js';
import { isRateLimited }                  from './rate-limiter.js';
import { runPipeline, withTimeout }       from './pipeline.js';
import { getGreetingUrl, GREETING_TEXT }  from './greeting.js';
import { clearSession, getStats as memStats } from '../memory/memory.service.js';
import { detectLang, twilioLocale }       from '../lang/lang.service.js';
import { sanitizeText }                   from '../../api/middleware/validation.js';
import {
  twimlGather, twimlPlayThenGather, twimlSayThenGather, twimlError,
} from './twiml.builder.js';

const log = childLogger('voice');

// ── POST /twilio/voice ────────────────────────────────────────────────────────

export async function handleVoice(req, res, saveAudio) {
  const { CallSid: callSid, From: from } = req.body;
  log.info({ callSid }, 'Incoming call');
  callsTotal.inc();

  if (await isRateLimited(from)) {
    log.warn({ callSid }, 'Rate limited on /voice');
    return res.send(
      twimlSayThenGather('Trop de requêtes. Veuillez patienter.', `${config.BASE_URL}/twilio/gather`)
    );
  }

  const gatherUrl    = `${config.BASE_URL}/twilio/gather`;
  const greetingUrl  = getGreetingUrl();
  const twiml        = greetingUrl
    ? twimlPlayThenGather(greetingUrl, gatherUrl)
    : twimlGather(GREETING_TEXT, gatherUrl, { timeout: 5, speechTimeout: 'auto' });

  res.send(twiml);
}

// ── POST /twilio/gather ───────────────────────────────────────────────────────

export async function handleGather(req, res, saveAudio) {
  const {
    SpeechResult: rawText = '',
    Confidence:   confidence,
    CallSid:      callSid,
    From:         from,
  } = req.body;

  const text     = sanitizeText(rawText, 500);
  const userLang = detectLang(text);
  const locale   = twilioLocale(userLang);
  const gatherUrl = `${config.BASE_URL}/twilio/gather`;

  log.info({ callSid, text: text?.slice(0, 80), confidence, locale }, 'Gather received');

  if (await isRateLimited(from)) {
    return res.send(twimlSayThenGather('Trop de requêtes.', gatherUrl, { locale }));
  }

  if (!text) {
    return res.send(twimlSayThenGather("Je n'ai pas bien entendu. Pouvez-vous répéter ?", gatherUrl, { locale }));
  }

  const twiml = await withTimeout(
    () => runPipeline({ text, callSid, from }, saveAudio).catch(err => {
      log.error({ err: err.message, callSid }, 'Pipeline error');
      errorCounter.inc({ service: 'pipeline', errorType: err.code ?? 'unknown' });
      return twimlError(gatherUrl, locale);
    }),
    gatherUrl,
    locale
  );

  res.send(twiml);
}

// ── POST /twilio/status ───────────────────────────────────────────────────────

export async function handleStatus(req, res) {
  const { CallSid, CallStatus } = req.body;
  log.info({ callSid: CallSid, status: CallStatus }, 'Call status update');

  if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(CallStatus)) {
    await clearSession(CallSid);
    activeSessions.set(memStats().activeSessions);
  }
  res.sendStatus(204);
}

// ── GET /twilio/health ────────────────────────────────────────────────────────

export function handleHealth(req, res) {
  res.json({
    ok:            true,
    timestamp:     new Date().toISOString(),
    config: {
      ttsProvider:    config.TTS_PROVIDER,
      whisperBackend: config.WHISPER_BACKEND,
      ollamaModel:    config.OLLAMA_MODEL,
    },
    memory:        memStats(),
    greetingReady: !!getGreetingUrl(),
    redis:         !!process.env.REDIS_URL,
  });
}
