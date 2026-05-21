// twilio.js — v5
// Voice + SMS pipeline:
//   - <Gather speech> (zero Whisper, zero audio download)
//   - 12s pipeline timeout (Twilio drops at 15s)
//   - Rate limiting: Redis sliding window (in-memory fallback)
//   - Pre-synthesized greeting (TTS quality)
//   - Inflight dedup for TTS
//   - Twilio signature HMAC verification (production)
//   - Structured Pino logging + Prometheus metrics

'use strict';

import crypto from 'crypto';
import { Router } from 'express';
import { resolve } from 'path';
import { config } from './env.js';
import { understand } from './nlu.js';
import { translate } from './claude.js';
import { dispatch } from './agent.js';
import { synthesize } from './tts.js';
import { autoReply } from './responder.js';
import { detectLang, twilioLocale } from './lang.js';
import { addUserTurn, addAgentTurn, clearSession, getStats as memStats } from './memory.js';
import { saveAudio } from './utils/audio.js';
import {
  twimlPlayThenGather,
  twimlSayThenGather,
  twimlGather,
  twimlError,
  TWIML_HEADERS,
} from './utils/twilio.js';
import { childLogger } from './utils/logger.js';
import {
  pipelineLatency,
  nluLatency,
  ttsLatency,
  callsTotal,
  smsTotal,
  rateLimitCounter,
  ttsCacheHits,
  activeSessions,
  inflightTts,
  errorCounter,
} from './utils/metrics.js';
import {
  validateBody,
  TwilioVoiceSchema,
  TwilioGatherSchema,
  TwilioStatusSchema,
  TwilioSmsSchema,
  sanitizeText,
} from './utils/validation.js';
import { cacheIncr, cacheExpire } from './utils/redis.js';

const log = childLogger('twilio');
export const router = Router();

// ── TwiML headers ─────────────────────────────────────────────────────────────
router.use((req, res, next) => {
  res.set(TWIML_HEADERS);
  next();
});

// ── Twilio signature verification (production) ────────────────────────────────

function verifyTwilioSignature(req, res, next) {
  if (config.nodeEnv !== 'production') return next();
  if (!config.twilio.authToken) return next();

  const sig = req.get('X-Twilio-Signature') ?? '';
  const url = `${config.baseUrl}${req.originalUrl}`;
  const body = Object.keys(req.body)
    .sort()
    .reduce((acc, k) => acc + k + req.body[k], '');
  const expected = crypto
    .createHmac('sha1', config.twilio.authToken)
    .update(url + body)
    .digest('base64');

  if (expected !== sig) {
    log.warn({ url, sigPrefix: sig.slice(0, 8) }, 'Invalid Twilio signature — rejected');
    return res.status(401).send(twimlError());
  }
  next();
}

router.use(verifyTwilioSignature);

// ── Inflight dedup ────────────────────────────────────────────────────────────
const _inflight = new Map();

// ── Pre-synthesized greeting ──────────────────────────────────────────────────
let _greetingUrl = null;
const GREETING_TEXT = 'Bonjour, je suis votre assistant Wolf Inc. Comment puis-je vous aider ?';

export async function prewarmGreeting() {
  try {
    const ttsResult = await synthesize(GREETING_TEXT);
    const { filename } = await saveAudio(ttsResult.buffer, resolve(config.audioDir), ttsResult.ext);
    _greetingUrl = `${config.baseUrl}/audio/${filename}`;
    log.info({ url: _greetingUrl }, 'Greeting pre-warmed');
  } catch (err) {
    log.warn({ err: err.message }, 'Greeting pre-warm failed — using <Say> fallback');
  }
}

// ── Rate limiter — Redis sliding window (in-memory fallback) ──────────────────
const RATE_LIMIT = 20;
const RATE_WINDOW = 60; // seconds

async function _isRateLimited(phone) {
  if (!phone || phone === 'unknown') return false;
  const key = `rl:${_hashPhone(phone)}`;

  const count = await cacheIncr(key);
  if (count === 1) await cacheExpire(key, RATE_WINDOW);

  if (count > RATE_LIMIT) {
    rateLimitCounter.inc({ phone_hash: _hashPhone(phone) });
    return true;
  }
  return false;
}

function _hashPhone(phone) {
  return crypto.createHash('sha256').update(phone).digest('hex').slice(0, 12);
}

// ── Pipeline timeout ──────────────────────────────────────────────────────────
const PIPELINE_TIMEOUT_MS = 12_000;

function _withTimeout(promise, fallbackFn) {
  return Promise.race([
    promise,
    new Promise(r => setTimeout(() => r(fallbackFn()), PIPELINE_TIMEOUT_MS)),
  ]);
}

// ═══════════════════════════════════════════════════════════
// POST /twilio/voice
// ═══════════════════════════════════════════════════════════

router.post('/voice', validateBody(TwilioVoiceSchema), async (req, res) => {
  const { CallSid: callSid, From: from } = req.validated;
  log.info({ callSid, from }, 'Incoming call');
  callsTotal.inc();

  if (await _isRateLimited(from)) {
    log.warn({ from }, 'Rate limited on /voice');
    return res.send(
      twimlSayThenGather('Trop de requêtes. Veuillez patienter.', `${config.baseUrl}/twilio/gather`)
    );
  }

  const gatherUrl = `${config.baseUrl}/twilio/gather`;
  if (_greetingUrl) return res.send(twimlPlayThenGather(_greetingUrl, gatherUrl));
  res.send(twimlGather(GREETING_TEXT, gatherUrl, { timeout: 5, speechTimeout: 'auto' }));
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/gather
// ═══════════════════════════════════════════════════════════

router.post('/gather', validateBody(TwilioGatherSchema), async (req, res) => {
  const {
    SpeechResult: rawText,
    Confidence: confidence,
    CallSid: callSid,
    From: from,
  } = req.validated;
  const text = sanitizeText(rawText ?? '', 500);
  const userLang = detectLang(text);
  const locale = twilioLocale(userLang);

  log.info({ callSid, from, text: text?.slice(0, 80), confidence, locale }, 'Gather received');

  if (await _isRateLimited(from)) {
    log.warn({ from }, 'Rate limited on /gather');
    return res.send(
      twimlSayThenGather(
        'Trop de requêtes. Veuillez patienter un moment.',
        `${config.baseUrl}/twilio/gather`,
        { locale }
      )
    );
  }

  if (!text) {
    return res.send(await _sayOrPlay("Je n'ai pas bien entendu. Pouvez-vous répéter ?", locale));
  }

  const gatherUrl = `${config.baseUrl}/twilio/gather`;

  const result = await _withTimeout(
    runPipelineText({ text, callSid, from }).catch(err => {
      log.error({ err: err.message, callSid }, 'Pipeline error');
      errorCounter.inc({ service: 'pipeline', errorType: err.code ?? 'unknown' });
      return twimlError(gatherUrl, locale);
    }),
    () => {
      log.warn({ callSid }, 'Pipeline timeout — graceful fallback');
      return twimlSayThenGather('Je traite encore votre demande, veuillez patienter.', gatherUrl, {
        locale,
      });
    }
  );

  res.send(result);
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/status
// ═══════════════════════════════════════════════════════════

router.post('/status', validateBody(TwilioStatusSchema), async (req, res) => {
  const { CallSid, CallStatus } = req.validated;
  log.info({ callSid: CallSid, status: CallStatus }, 'Call status update');
  if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(CallStatus)) {
    await clearSession(CallSid);
    const stats = getStats();
    activeSessions.set(stats.activeSessions);
  }
  res.sendStatus(204);
});

// ═══════════════════════════════════════════════════════════
// GET /twilio/health
// ═══════════════════════════════════════════════════════════

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    config: {
      sttMode: config.stt.mode,
      whisperBackend: config.whisper?.backend ?? 'n/a',
      ttsProvider: config.tts.provider,
      ollamaModel: config.ollama.model,
    },
    memory: memStats(),
    inflightTts: _inflight.size,
    greetingReady: _greetingUrl !== null,
    redis: !!process.env.REDIS_URL,
  });
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/sms
// ═══════════════════════════════════════════════════════════

router.post('/sms', validateBody(TwilioSmsSchema), async (req, res) => {
  const { Body: rawBody, From: from } = req.validated;
  const body = sanitizeText(rawBody ?? '', 1600);
  log.info({ from, body: body?.slice(0, 80) }, 'SMS received');
  smsTotal.inc();

  const XML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  if (!body) return res.set('Content-Type', 'text/xml').send(XML_EMPTY);

  if (await _isRateLimited(from)) {
    return res
      .set('Content-Type', 'text/xml')
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Trop de messages. Réessayez dans une minute.</Message></Response>'
      );
  }

  try {
    const reply = await autoReply(body, config.sms?.tone ?? 'friendly');
    log.info({ from, preview: reply.slice(0, 80) }, 'SMS reply sent');
    res
      .set('Content-Type', 'text/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${_escapeXml(reply)}</Message></Response>`
      );
  } catch (err) {
    log.error({ err: err.message, from }, 'SMS autoReply failed');
    errorCounter.inc({ service: 'sms', errorType: 'autoreply_failed' });
    res
      .set('Content-Type', 'text/xml')
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Service temporairement indisponible.</Message></Response>'
      );
  }
});

// ═══════════════════════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════════════════════

async function runPipelineText({ text, callSid, from }) {
  const userKey = from !== 'unknown' ? from : callSid;
  const userLang = detectLang(text);
  const locale = twilioLocale(userLang);
  const pipeTimer = pipelineLatency.startTimer();

  await addUserTurn(callSid, text);
  activeSessions.set(memStats().activeSessions);

  // NLU
  const nluTimer = nluLatency.startTimer({ provider: config.claude.apiKey ? 'claude' : 'ollama' });
  let nluResult;
  try {
    nluResult = await understand(text, callSid);
    nluTimer({ success: 'true' });
    log.info(
      {
        callSid,
        intent: nluResult.intent,
        confidence: Math.round(nluResult.confidence * 100),
        resolved: nluResult._resolved ?? 'no',
      },
      'NLU complete'
    );
  } catch (err) {
    nluTimer({ success: 'false' });
    log.error({ err: err.message, callSid }, 'NLU failed');
    pipeTimer({ intent: 'nlu_error', success: 'false' });
    const fallback = "Mon système d'analyse est indisponible. Veuillez rappeler.";
    const translated = await translate(fallback, userLang);
    return _sayOrPlay(translated, locale);
  }

  if (nluResult.needsClarification) {
    const msg =
      "Je n'ai pas bien compris. Vous pouvez me demander de créer, annuler, modifier ou consulter vos rendez-vous.";
    const translated = await translate(msg, userLang);
    await addAgentTurn(callSid, translated);
    pipeTimer({ intent: 'clarification', success: 'true' });
    return _sayOrPlay(translated, locale);
  }

  if (nluResult.missing?.length > 0) {
    const askMsg = _buildMissingFieldQuestion(nluResult);
    const translated = await translate(askMsg, userLang);
    await addAgentTurn(callSid, translated, nluResult);
    pipeTimer({ intent: nluResult.intent, success: 'true' });
    return _sayOrPlay(translated, locale);
  }

  // Agent dispatch
  let agentResult;
  try {
    agentResult = await dispatch(nluResult, userKey);
    log.info({ callSid, preview: agentResult.message.slice(0, 80) }, 'Agent response');
  } catch (err) {
    log.error({ err: err.message, callSid }, 'Agent failed');
    agentResult = { ok: false, message: 'Une erreur interne est survenue. Veuillez réessayer.' };
  }

  let responseMessage = agentResult.message;
  if (userLang !== 'fr') {
    responseMessage = await translate(responseMessage, userLang);
  }

  await addAgentTurn(callSid, responseMessage, nluResult);
  pipeTimer({ intent: nluResult.intent, success: String(agentResult.ok) });
  return _sayOrPlay(responseMessage, locale);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _sayOrPlay(text, locale = 'fr-FR') {
  const gatherUrl = `${config.baseUrl}/twilio/gather`;

  const cacheKey = `${locale}:${text}`;
  if (_inflight.has(cacheKey)) {
    ttsCacheHits.inc({ type: 'inflight' });
    return _inflight.get(cacheKey);
  }

  const promise = (async () => {
    const ttsTimer = ttsLatency.startTimer({ provider: config.tts.provider });
    try {
      const ttsResult = await synthesize(text, locale);
      ttsTimer({ success: 'true' });
      const { filename } = await saveAudio(
        ttsResult.buffer,
        resolve(config.audioDir),
        ttsResult.ext
      );
      const url = `${config.baseUrl}/audio/${filename}`;
      inflightTts.set(_inflight.size);
      return twimlPlayThenGather(url, gatherUrl, { locale });
    } catch (err) {
      ttsTimer({ success: 'false' });
      log.error({ err: err.message }, 'TTS/save failed — falling back to <Say>');
      errorCounter.inc({ service: 'tts', errorType: err.code ?? 'unknown' });
      return twimlSayThenGather(text, gatherUrl, { locale });
    } finally {
      _inflight.delete(cacheKey);
      inflightTts.set(_inflight.size);
    }
  })();

  _inflight.set(cacheKey, promise);
  inflightTts.set(_inflight.size);
  return promise;
}

function _buildMissingFieldQuestion({ intent, missing, subject }) {
  const subj = subject ? ` (${subject})` : '';
  if (intent === 'create_event') {
    if (missing.includes('date') && missing.includes('heure'))
      return `Pour quel jour et à quelle heure souhaitez-vous créer ce rendez-vous${subj} ?`;
    if (missing.includes('date')) return `Pour quel jour souhaitez-vous ce rendez-vous${subj} ?`;
    if (missing.includes('heure')) return `À quelle heure souhaitez-vous ce rendez-vous${subj} ?`;
  }
  if (intent === 'cancel_event')
    return 'Quel rendez-vous souhaitez-vous annuler ? Précisez la date.';
  if (intent === 'update_event')
    return 'Quel rendez-vous souhaitez-vous modifier ? Précisez la date.';
  return 'Pouvez-vous préciser votre demande ?';
}

function _escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Re-export getStats for other modules
function getStats() {
  return memStats();
}
