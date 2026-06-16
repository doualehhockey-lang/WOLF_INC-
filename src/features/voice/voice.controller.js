// src/features/voice/voice.controller.js — Route handlers for Twilio voice webhooks.
// Keeps controllers thin: validate → rate-limit → delegate to pipeline.
<<<<<<< HEAD
//
// Hardening:
//   - Gather-level idempotency: deduplicates Twilio webhook retries by
//     SHA-256(callSid + text + 30s time window) so retried gathers don't
//     re-dispatch the agent and create duplicate calendar events.

import { createHash } from 'crypto';
import { childLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
import { callsTotal, activeSessions, errorCounter } from '../../core/metrics.js';
import { isRateLimited } from './rate-limiter.js';
import { runPipeline, withTimeout } from './pipeline.js';
import { getGreetingUrl, getFillerUrl, getFillerText, GREETING_TEXT } from './greeting.js';
import { clearSession, getStats as memStats } from '../memory/memory.service.js';
import { detectLang, twilioLocale } from '../lang/lang.service.js';
import { sanitizeText } from '../../api/middleware/validation.js';
import { cacheGet, cacheSet } from '../../infra/redis/redisClient.js';
import {
  twimlGather,
  twimlPlayThenGather,
  twimlSayThenGather,
  twimlError,
  twimlFillerThenRedirect,
} from './twiml.builder.js';

// ── Pending pipeline results ─────────────────────────────────────────────────
// Two-phase gather flow to eliminate dead silence:
//   Phase 1 (handleGather): Immediately returns a filler ("Un instant...") +
//     <Redirect> to /twilio/gather-result, and kicks off the pipeline async.
//   Phase 2 (handleGatherResult): Picks up the finished pipeline result.
// If the pipeline finishes before the filler plays (~1.5s), the redirect
// picks up the result instantly. If not, the timeout fallback catches it.

/** @type {Map<string, Promise<string>>} */
const _pendingResults = new Map();

// ── Gather idempotency helpers ────────────────────────────────────────────────
// Twilio retries /twilio/gather on 5xx or connection drop. Without deduplication,
// a retry processes the same utterance a second time and creates a duplicate
// calendar event. We deduplicate within a 30-second window: same callSid + same
// transcript within 30s is treated as a retry, not a new utterance.

const GATHER_IDEM_TTL = 60; // seconds — covers Twilio's 15s retry window with margin

function _gatherHash(callSid, text) {
  const window = Math.floor(Date.now() / 30_000); // 30-second bucket
  return createHash('sha256').update(`${callSid}:${text}:${window}`).digest('hex').slice(0, 24);
}

function _gatherIdemKey(hash) {
  return `gather:idem:${hash}`;
}

async function _getGatherReply(hash) {
  try {
    return await cacheGet(_gatherIdemKey(hash));
  } catch {
    return null;
  }
}

async function _saveGatherReply(hash, twiml) {
  try {
    await cacheSet(_gatherIdemKey(hash), twiml, GATHER_IDEM_TTL);
  } catch {
    /* best-effort */
  }
}

=======

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

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
const log = childLogger('voice');

// ── POST /twilio/voice ────────────────────────────────────────────────────────

<<<<<<< HEAD
export async function handleVoice(req, res, _saveAudio) {
=======
export async function handleVoice(req, res, saveAudio) {
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const { CallSid: callSid, From: from } = req.body;
  log.info({ callSid }, 'Incoming call');
  callsTotal.inc();

  if (await isRateLimited(from)) {
    log.warn({ callSid }, 'Rate limited on /voice');
<<<<<<< HEAD
    // M8 FIX: Retry-After tells Twilio and monitoring systems when to retry.
    // RATE_WINDOW is 60s — caller should back off for the full window.
    res.set('Retry-After', '60');
    return res.send(
      twimlSayThenGather(
        "Je suis désolée, nous recevons beaucoup d'appels en ce moment. Pourriez-vous rappeler dans quelques instants ?",
        `${config.BASE_URL}/twilio/gather`
      )
    );
  }

  const gatherUrl = `${config.BASE_URL}/twilio/gather`;
  const greetingUrl = getGreetingUrl();
  const twiml = greetingUrl
=======
    return res.send(
      twimlSayThenGather('Trop de requêtes. Veuillez patienter.', `${config.BASE_URL}/twilio/gather`)
    );
  }

  const gatherUrl    = `${config.BASE_URL}/twilio/gather`;
  const greetingUrl  = getGreetingUrl();
  const twiml        = greetingUrl
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    ? twimlPlayThenGather(greetingUrl, gatherUrl)
    : twimlGather(GREETING_TEXT, gatherUrl, { timeout: 5, speechTimeout: 'auto' });

  res.send(twiml);
}

// ── POST /twilio/gather ───────────────────────────────────────────────────────
<<<<<<< HEAD
// Phase 1: Validate input, start pipeline async, respond immediately with a
// natural filler message ("Un instant, je vérifie...") so the caller never
// hears silence. The <Redirect> sends Twilio to /twilio/gather-result to
// pick up the real response once the pipeline finishes.
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

export async function handleGather(req, res, saveAudio) {
  const {
    SpeechResult: rawText = '',
<<<<<<< HEAD
    Confidence: confidence,
    CallSid: callSid,
    From: from,
  } = req.body;

  const text = sanitizeText(rawText, 500);
  const userLang = detectLang(text);
  const locale = twilioLocale(userLang);
=======
    Confidence:   confidence,
    CallSid:      callSid,
    From:         from,
  } = req.body;

  const text     = sanitizeText(rawText, 500);
  const userLang = detectLang(text);
  const locale   = twilioLocale(userLang);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const gatherUrl = `${config.BASE_URL}/twilio/gather`;

  log.info({ callSid, text: text?.slice(0, 80), confidence, locale }, 'Gather received');

  if (await isRateLimited(from)) {
<<<<<<< HEAD
    res.set('Retry-After', '60');
    return res.send(
      twimlSayThenGather(
        'Je suis désolée, pourriez-vous patienter un instant avant de réessayer ?',
        gatherUrl,
        { locale }
      )
    );
  }

  if (!text) {
    return res.send(
      twimlSayThenGather(
        "Excusez-moi, je n'ai pas bien entendu. Pourriez-vous répéter ?",
        gatherUrl,
        { locale }
      )
    );
  }

  // Idempotency check — return cached TwiML if this gather was already processed
  // within the last 30s (covers Twilio retry storms without deduplicating legitimate
  // repeated utterances across separate 30-second windows).
  const gatherHash = _gatherHash(callSid, text);
  const cachedTwiml = await _getGatherReply(gatherHash);
  if (cachedTwiml) {
    log.info({ callSid }, 'Gather duplicate detected — returning cached TwiML');
    return res.send(cachedTwiml);
  }

  // Start pipeline processing in the background
  const pipelinePromise = withTimeout(
    () =>
      runPipeline({ text, callSid, from }, saveAudio).catch(err => {
        log.error({ err: err.message, callSid }, 'Pipeline error');
        errorCounter.inc({ service: 'pipeline', errorType: err.code ?? 'unknown' });
        return twimlError(gatherUrl, locale);
      }),
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    gatherUrl,
    locale
  );

<<<<<<< HEAD
  // Store the pending result keyed by callSid
  _pendingResults.set(callSid, pipelinePromise);

  // Respond IMMEDIATELY with a filler message — zero dead silence
  const fillerUrl = getFillerUrl();
  const fillerText = getFillerText();
  const resultUrl = `${config.BASE_URL}/twilio/gather-result`;

  res.send(twimlFillerThenRedirect(fillerUrl, fillerText, resultUrl, locale));
}

// ── POST /twilio/gather-result ───────────────────────────────────────────────
// Phase 2: Twilio redirects here after the filler plays (~1.5s).
// By now the pipeline has likely finished. If not, we await with a timeout.

export async function handleGatherResult(req, res) {
  const { CallSid: callSid } = req.body;
  const gatherUrl = `${config.BASE_URL}/twilio/gather`;

  const pending = _pendingResults.get(callSid);
  if (!pending) {
    // No pending result — shouldn't happen, but handle gracefully
    log.warn({ callSid }, 'No pending pipeline result for gather-result');
    return res.send(
      twimlSayThenGather('Excusez-moi, pourriez-vous répéter votre demande ?', gatherUrl)
    );
  }

  try {
    const twiml = await pending;
    _pendingResults.delete(callSid);

    // Cache for idempotency
    const gatherHash = _gatherHash(callSid, 'result');
    await _saveGatherReply(gatherHash, twiml);

    res.send(twiml);
  } catch (err) {
    _pendingResults.delete(callSid);
    log.error({ err: err.message, callSid }, 'Pipeline result retrieval failed');
    res.send(twimlError(gatherUrl));
  }
=======
  res.send(twiml);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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
<<<<<<< HEAD
    ok: true,
    timestamp: new Date().toISOString(),
    config: {
      ttsProvider: config.TTS_PROVIDER,
      whisperBackend: config.WHISPER_BACKEND,
    },
    memory: memStats(),
    greetingReady: !!getGreetingUrl(),
    redis: !!process.env.REDIS_URL,
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  });
}
