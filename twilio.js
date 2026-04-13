// src/routes/twilio.js — v2
// Routes Twilio Voice avec mémoire conversationnelle.
//
// AMÉLIORATIONS v2 :
//   - Mémoire par CallSid (multi-tours)
//   - Retry sur RecordingUrl (Twilio parfois lent)
//   - Gestion des champs manquants (demande date/heure si absent)
//   - Réponse vocale de bienvenue personnalisée
//   - Nettoyage session à la fin de l'appel

'use strict';

import { Router }     from 'express';
import { resolve }    from 'path';
import { config }     from './env.js';
import { transcribe } from './stt.js';
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
import {
  downloadTwilioMedia,
  saveAudio,
} from './utils/audio.js';
import {
  twimlSay,
  twimlPlay,
  twimlRecord,
  twimlGather,
  twimlError,
  TWIML_HEADERS,
} from './utils/twilio.js';

export const router = Router();

// ═══════════════════════════════════════════════════════════
// HEADERS TwiML sur toutes les routes /twilio/*
// ═══════════════════════════════════════════════════════════

router.use((req, res, next) => {
  res.set(TWIML_HEADERS);
  next();
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/voice
// Point d'entrée — accueil + <Record>
// ═══════════════════════════════════════════════════════════

router.post('/voice', async (req, res) => {
  const callSid = req.body?.CallSid ?? 'unknown';
  const from    = req.body?.From    ?? 'inconnu';
  console.log(`\n[Twilio] 📞 Appel entrant — CallSid: ${callSid} | De: ${from}`);

  const recordingUrl = `${config.baseUrl}/twilio/recording`;

  res.send(twimlRecord(recordingUrl, {
    timeout:  3,   // secondes de silence avant de couper
    maxLength: 30, // durée max de l'enregistrement
    playBeep:  true,
  }));
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/voice-gather  (mode alternatif avec <Gather>)
// Plus rapide — Twilio transcrit en temps réel (pas de download)
// ═══════════════════════════════════════════════════════════

router.post('/voice-gather', (req, res) => {
  const gatherUrl = `${config.baseUrl}/twilio/gather`;
  res.send(twimlGather(
    'Bonjour, je suis votre assistant de gestion de rendez-vous. Que puis-je faire pour vous ?',
    gatherUrl,
    { timeout: 5 }
  ));
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/recording
// Twilio envoie l'URL de l'enregistrement → pipeline complet
// ═══════════════════════════════════════════════════════════

router.post('/recording', async (req, res) => {
  const {
    RecordingUrl,
    RecordingStatus,
    CallSid = 'unknown',
    RecordingSid,
    RecordingDuration,
  } = req.body ?? {};

  console.log(`[Twilio] Recording — CallSid: ${CallSid} | Status: ${RecordingStatus} | Durée: ${RecordingDuration}s`);

  if (RecordingStatus !== 'completed' || !RecordingUrl) {
    const msg = "Je n'ai pas reçu votre message. Pouvez-vous rappeler ?";
    return res.send(await _sayOrPlay(msg));
  }

  try {
    const twiml = await runPipeline({
      audioUrl: `${RecordingUrl}.wav`, // Twilio fournit l'URL sans extension
      callSid:  CallSid,
    });
    res.send(twiml);
  } catch (err) {
    console.error('[Twilio] Pipeline error:', err.message);
    res.send(twimlError());
  }
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/gather
// Reçoit la transcription <Gather> → pipeline NLU direct (sans STT)
// ═══════════════════════════════════════════════════════════

router.post('/gather', async (req, res) => {
  const {
    SpeechResult: text,
    Confidence:   confidence,
    CallSid       = 'unknown',
  } = req.body ?? {};

  console.log(`[Twilio] Gather — "${text}" (conf Twilio: ${confidence})`);

  if (!text?.trim()) {
    const msg = "Je n'ai pas bien entendu. Pouvez-vous répéter ?";
    return res.send(await _sayOrPlay(msg));
  }

  try {
    const twiml = await runPipelineText({ text: text.trim(), callSid: CallSid });
    res.send(twiml);
  } catch (err) {
    console.error('[Twilio] Gather error:', err.message);
    res.send(twimlError());
  }
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/status
// Twilio appelle ce webhook quand l'appel se termine → nettoyage mémoire
// Configurer dans Twilio : "Call Status Changes" → ce webhook
// ═══════════════════════════════════════════════════════════

router.post('/status', (req, res) => {
  const { CallSid, CallStatus } = req.body ?? {};
  console.log(`[Twilio] Status — CallSid: ${CallSid} | Status: ${CallStatus}`);

  if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(CallStatus)) {
    clearSession(CallSid);
    console.log(`[Memory] Session ${CallSid} nettoyée (appel ${CallStatus})`);
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
      sttMode:      config.stt.mode,
      whisperBackend: config.whisper?.backend ?? 'n/a',
      ttsProvider:  config.tts.provider,
      ollamaModel:  config.ollama.model,
    },
    memory: memStats(),
  }, null, 2));
});

// ═══════════════════════════════════════════════════════════
// POST /twilio/sms
// Auto-répondeur SMS — Twilio envoie le message entrant ici.
// Configurer dans Twilio : Messaging → "A message comes in" → ce webhook.
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
// PIPELINE INTERNE
// ═══════════════════════════════════════════════════════════

/**
 * Pipeline depuis une URL audio Twilio
 */
async function runPipeline({ audioUrl, callSid }) {
  // ── 1. Download audio avec retry (Twilio peut être lent) ──
  console.log(`[Pipeline] ⬇️  Download audio...`);
  let audioBuffer;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      audioBuffer = await downloadTwilioMedia(
        audioUrl,
        config.twilio.accountSid,
        config.twilio.authToken
      );
      console.log(`[Pipeline] Audio: ${audioBuffer.length} bytes (tentative ${attempt})`);
      break;
    } catch (err) {
      console.warn(`[Pipeline] Download tentative ${attempt}/3: ${err.message}`);
      if (attempt === 3) throw err;
      await _sleep(1000 * attempt); // délai exponentiel
    }
  }

  // ── 2. STT — TERMINATOR v7 + Whisper ──────────────────────
  console.log(`[Pipeline] 🎤 STT...`);
  let transcript;
  try {
    transcript = await transcribe(audioBuffer, 'wav');
    console.log(`[Pipeline] Transcript: "${transcript}"`);
  } catch (err) {
    console.error('[Pipeline] STT failed:', err.message);
    const msg = "Je n'ai pas pu comprendre votre message. Pouvez-vous rappeler ?";
    return _sayOrPlay(msg);
  }

  return runPipelineText({ text: transcript, callSid });
}

/**
 * Pipeline depuis un texte (STT déjà fait ou <Gather>)
 * Intègre la mémoire conversationnelle.
 */
async function runPipelineText({ text, callSid }) {
  // ── 3. Enregistre le tour utilisateur en mémoire ──────────
  addUserTurn(callSid, text);

  // ── 4. NLU — Ollama + contexte mémoire ────────────────────
  console.log(`[Pipeline] 🧠 NLU: "${text}"`);
  let nluResult;
  try {
    nluResult = await understand(text, callSid);
    console.log(`[Pipeline] Intent: ${nluResult.intent} | conf: ${Math.round(nluResult.confidence * 100)}% | résolu: ${nluResult._resolved ?? 'non'}`);
  } catch (err) {
    console.error('[Pipeline] NLU failed:', err.message);
    const msg = "Mon système d'analyse est temporairement indisponible. Veuillez rappeler dans quelques instants.";
    return _sayOrPlay(msg);
  }

  // ── 5. Clarification si confiance insuffisante ────────────
  if (nluResult.needsClarification) {
    const msg = "Je n'ai pas bien compris. Vous pouvez me demander de créer, annuler, modifier ou consulter vos rendez-vous.";
    addAgentTurn(callSid, msg);
    return _sayOrPlay(msg);
  }

  // ── 6. Champs manquants → demande de complétion ──────────
  if (nluResult.missing?.length > 0) {
    const askMsg = _buildMissingFieldQuestion(nluResult);
    addAgentTurn(callSid, askMsg, nluResult); // mémorise l'intent partiel
    return _sayOrPlay(askMsg);
  }

  // ── 7. Agent logique — action métier ──────────────────────
  console.log(`[Pipeline] ⚡ Agent: ${nluResult.intent}`);
  let agentResult;
  try {
    agentResult = await dispatch(nluResult, callSid);
    console.log(`[Pipeline] Réponse: "${agentResult.message.slice(0, 80)}"`);
  } catch (err) {
    console.error('[Pipeline] Agent failed:', err.message);
    agentResult = { ok: false, message: 'Une erreur interne est survenue. Veuillez réessayer.' };
  }

  // ── 8. Enregistre le tour agent en mémoire ────────────────
  addAgentTurn(callSid, agentResult.message, nluResult);

  // ── 9. TTS + <Play> ───────────────────────────────────────
  return _sayOrPlay(agentResult.message);
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Synthétise le texte et retourne un TwiML <Play> ou <Say> en fallback.
 */
async function _sayOrPlay(text) {
  console.log(`[Pipeline] 🔊 TTS: "${text.slice(0, 60)}..."`);
  try {
    const ttsResult = await synthesize(text);
    const { filepath, filename } = await saveAudio(
      ttsResult.buffer,
      resolve(config.audioDir),
      ttsResult.ext
    );
    const url = `${config.baseUrl}/audio/${filename}`;
    console.log(`[Pipeline] Audio TTS: ${url}`);
    return twimlPlay(url);
  } catch (err) {
    console.error('[Pipeline] TTS/save failed:', err.message);
    return twimlSay(text); // fallback Twilio <Say>
  }
}

/**
 * Construit la question pour demander les champs manquants
 */
function _buildMissingFieldQuestion(nluResult) {
  const { intent, missing, subject } = nluResult;
  const subj = subject ? ` (${subject})` : '';

  if (intent === 'create_event') {
    if (missing.includes('date') && missing.includes('heure')) {
      return `Pour quel jour et à quelle heure souhaitez-vous créer ce rendez-vous${subj} ?`;
    }
    if (missing.includes('date')) {
      return `Pour quel jour souhaitez-vous ce rendez-vous${subj} ?`;
    }
    if (missing.includes('heure')) {
      return `À quelle heure souhaitez-vous ce rendez-vous${subj} ?`;
    }
  }

  if (intent === 'cancel_event') {
    return `Quel rendez-vous souhaitez-vous annuler ? Précisez la date.`;
  }
  if (intent === 'update_event') {
    return `Quel rendez-vous souhaitez-vous modifier ? Précisez la date.`;
  }

  return 'Pouvez-vous préciser votre demande ?';
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function _escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
