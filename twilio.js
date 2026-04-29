// twilio.js — v4
// Voice + SMS pipeline with:
//   - <Gather speech> (zero Whisper, zero audio download)
//   - 12s pipeline timeout (Twilio drops at 15s)
//   - Rate limiting per phone number
//   - Pre-synthesized greeting (TTS quality, not Twilio robot)
//   - Inflight dedup (parallel identical TTS requests share one Promise)
//   - Disk-persisted events (survive server restarts)

'use strict';

import { Router }  from 'express';
import { resolve } from 'path';
import { config }  from './env.js';
import { understand } from './nlu.js';
import { dispatch }   from './agent.js';
import { synthesize } from './tts.js';
import { autoReply }  from './responder.js';
import {
  addUserTurn,
  addAgentTurn,
  clearSession,
  getStats as memStats,
} from './memory.js';
import { saveAudio } from './utils/audio.js';
import {
  twimlPlayThenGather,
  twimlSayThenGather,
  twimlGather,
  twimlError,
  TWIML_HEADERS,
} from './utils/twilio.js';

export const router = Router();

// ── TwiML content-type on all /twilio/* ──────────────────────────────────────
router.use((req, res, next) => { res.set(TWIML_HEADERS); next(); });

// ── Inflight dedup ────────────────────────────────────────────────────────────
// text → Promise<twiml string>: concurrent callers share one synthesis
const _inflight = new Map();

// ── Pre-synthesized greeting URL ──────────────────────────────────────────────
// Set once on server start by prewarmGreeting() — null until ready
let _greetingUrl = null;
const GREETING_TEXT = 'Bonjour, je suis votre assistant Wolf Inc. Comment puis-je vous aider ?';

export async function prewarmGreeting() {
  try {
    const ttsResult = await synthesize(GREETING_TEXT);
    const { filename } = await saveAudio(
      ttsResult.buffer,
      resolve(config.audioDir),
      ttsResult.ext
    );
    _greetingUrl = `${config.baseUrl}/audio/${filename}`;
    console.log(`[TTS] Greeting pre-warmed: ${_greetingUrl}`);
  } catch (err) {
    console.warn('[TTS] Greeting pre-warm failed (will use <Say> fallback):', err.message);
  }
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Max 20 requests per phone number per 60-second window
const _ratemap = new Map(); // phone → { count, resetAt }
const RATE_LIMIT    = 20;
const RATE_WINDOW   = 60_000; // ms

function _isRateLimited(phone) {
  if (!phone || phone === 'unknown') return false;
  const now  = Date.now();
  const slot = _ratemap.get(phone);
  if (!slot || now > slot.resetAt) {
    _ratemap.set(phone, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  if (slot.count >= RATE_LIMIT) return true;
  slot.count++;
  return false;
}

// Cleanup rate map every minute to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _ratemap) if (now > v.resetAt) _ratemap.delete(k);
}, RATE_WINDOW).unref();

// ── Pipeline timeout ──────────────────────────────────────────────────────────
// Twilio drops webhook at 15s — respond within 12s or return a safe fallback
const PIPELINE_TIMEOUT_MS = 12_000;

function _withTimeout(promise, fallbackFn) {
  return Promise.race([
    promise,
    new Promise(resolve =>
      setTimeout(() => resolve(fallbackFn()), PIPELINE_TIMEOUT_MS)
    ),
  ]);
}

// ═══════════════════════════════════════════════════════════
// POST /twilio/voice — entry point
// ═══════════════════════════════════════════════════════════

router.post('/voice', (req, res) => {
  const callSid = req.body?.CallSid ?? 'unknown';
  const from    = req.body?.From    ?? 'unknown';
  console.log(`\n[Twilio] Appel entrant — CallSid: ${callSid} | De: ${from}`);

  if (_isRateLimited(from)) {
    console.warn(`[Rate] ${from} rate limited`);
    return res.send(twimlSayThenGather(
      'Trop de requêtes. Veuillez patienter.',
      `${config.baseUrl}/twilio/gather`
    ));
  }

  const gatherUrl = `${config.baseUrl}/twilio/gather`;

  // Use pre-synthesized TTS greeting if ready, otherwise fall back to Twilio <Say>
  if (_greetingUrl) {
    return res.send(twimlPlayThenGather(_greetingUrl, gatherUrl));
  }
  res.send(twimlGather(GREETING_TEXT, gatherUrl, { timeout: 5, speechTimeout: 'auto' }));
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/gather — speech transcription received
// ═══════════════════════════════════════════════════════════

router.post('/gather', async (req, res) => {
  const {
    SpeechResult: text,
    Confidence:   confidence,
    CallSid:      callSid = 'unknown',
    From:         from    = 'unknown',
  } = req.body ?? {};

  console.log(`[Twilio] Gather — "${text}" (conf: ${confidence}) | De: ${from}`);

  if (_isRateLimited(from)) {
    console.warn(`[Rate] ${from} rate limited on gather`);
    return res.send(twimlSayThenGather(
      'Trop de requêtes. Veuillez patienter un moment.',
      `${config.baseUrl}/twilio/gather`
    ));
  }

  if (!text?.trim()) {
    return res.send(await _sayOrPlay("Je n'ai pas bien entendu. Pouvez-vous répéter ?"));
  }

  const gatherUrl = `${config.baseUrl}/twilio/gather`;

  const result = await _withTimeout(
    runPipelineText({ text: text.trim(), callSid, from }).catch(err => {
      console.error('[Twilio] Pipeline error:', err.message);
      return twimlError(gatherUrl);
    }),
    () => {
      console.warn('[Twilio] Pipeline timeout — returning graceful fallback');
      return twimlSayThenGather(
        "Je traite encore votre demande, veuillez patienter.",
        gatherUrl
      );
    }
  );

  res.send(result);
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/status — call lifecycle (configure in Twilio console)
// ═══════════════════════════════════════════════════════════

router.post('/status', (req, res) => {
  const { CallSid, CallStatus } = req.body ?? {};
  console.log(`[Twilio] Status — ${CallSid} | ${CallStatus}`);
  if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(CallStatus)) {
    clearSession(CallSid);
    console.log(`[Memory] Session ${CallSid} nettoyée`);
  }
  res.sendStatus(204);
});

// ═══════════════════════════════════════════════════════════
// GET /twilio/health
// ═══════════════════════════════════════════════════════════

router.get('/health', (_req, res) => {
  res.set('Content-Type', 'application/json').send(JSON.stringify({
    ok:        true,
    timestamp: new Date().toISOString(),
    config: {
      sttMode:        config.stt.mode,
      whisperBackend: config.whisper?.backend ?? 'n/a',
      ttsProvider:    config.tts.provider,
      ollamaModel:    config.ollama.model,
    },
    memory:        memStats(),
    inflightTts:   _inflight.size,
    rateLimitedN:  _ratemap.size,
    greetingReady: _greetingUrl !== null,
  }, null, 2));
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/sms — auto-répondeur SMS
// ═══════════════════════════════════════════════════════════

router.post('/sms', async (req, res) => {
  const { Body: body, From: from } = req.body ?? {};
  console.log(`[SMS] De: ${from} | "${body}"`);

  const tone = config.sms?.tone ?? 'friendly';

  if (!body?.trim()) {
    return res.set('Content-Type', 'text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    );
  }

  if (_isRateLimited(from)) {
    return res.set('Content-Type', 'text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Trop de messages. Réessayez dans une minute.</Message></Response>'
    );
  }

  try {
    const reply = await autoReply(body.trim(), tone);
    console.log(`[SMS] Réponse (${tone}): "${reply.slice(0, 80)}"`);
    res.set('Content-Type', 'text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${_escapeXml(reply)}</Message></Response>`
    );
  } catch (err) {
    console.error('[SMS] autoReply failed:', err.message);
    res.set('Content-Type', 'text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Service temporairement indisponible.</Message></Response>'
    );
  }
});

// ═══════════════════════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════════════════════

async function runPipelineText({ text, callSid, from }) {
  const userKey = from !== 'unknown' ? from : callSid;

  addUserTurn(callSid, text);

  console.log(`[Pipeline] NLU: "${text}"`);
  let nluResult;
  try {
    nluResult = await understand(text, callSid);
    console.log(`[Pipeline] Intent: ${nluResult.intent} | conf: ${Math.round(nluResult.confidence * 100)}% | résolu: ${nluResult._resolved ?? 'non'}`);
  } catch (err) {
    console.error('[Pipeline] NLU failed:', err.message);
    return _sayOrPlay("Mon système d'analyse est indisponible. Veuillez rappeler.");
  }

  if (nluResult.needsClarification) {
    const msg = "Je n'ai pas bien compris. Vous pouvez me demander de créer, annuler, modifier ou consulter vos rendez-vous.";
    addAgentTurn(callSid, msg);
    return _sayOrPlay(msg);
  }

  if (nluResult.missing?.length > 0) {
    const askMsg = _buildMissingFieldQuestion(nluResult);
    addAgentTurn(callSid, askMsg, nluResult);
    return _sayOrPlay(askMsg);
  }

  console.log(`[Pipeline] Agent: ${nluResult.intent} | userKey: ${userKey}`);
  let agentResult;
  try {
    agentResult = await dispatch(nluResult, userKey);
    console.log(`[Pipeline] Réponse: "${agentResult.message.slice(0, 80)}"`);
  } catch (err) {
    console.error('[Pipeline] Agent failed:', err.message);
    agentResult = { ok: false, message: 'Une erreur interne est survenue. Veuillez réessayer.' };
  }

  addAgentTurn(callSid, agentResult.message, nluResult);
  return _sayOrPlay(agentResult.message);
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

async function _sayOrPlay(text) {
  const gatherUrl = `${config.baseUrl}/twilio/gather`;

  if (_inflight.has(text)) {
    console.log('[Pipeline] TTS inflight hit');
    return _inflight.get(text);
  }

  const promise = (async () => {
    try {
      const ttsResult = await synthesize(text);
      const { filename } = await saveAudio(
        ttsResult.buffer,
        resolve(config.audioDir),
        ttsResult.ext
      );
      const url = `${config.baseUrl}/audio/${filename}`;
      console.log(`[Pipeline] TTS: ${url}`);
      return twimlPlayThenGather(url, gatherUrl);
    } catch (err) {
      console.error('[Pipeline] TTS/save failed:', err.message);
      return twimlSayThenGather(text, gatherUrl);
    } finally {
      _inflight.delete(text);
    }
  })();

  _inflight.set(text, promise);
  return promise;
}

function _buildMissingFieldQuestion({ intent, missing, subject }) {
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

function _escapeXml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
