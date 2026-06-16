// src/features/voice/voice.router.js — Express router for Twilio voice webhooks.
// Mounts at /twilio (configured in src/api/router.js).
// Applies: TwiML headers, HMAC verification, body validation.

<<<<<<< HEAD
import { Router } from 'express';
import { config as _config } from '../../core/config.js';
=======
import { Router }    from 'express';
import { config }    from '../../core/config.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import { TWIML_HEADERS } from './twiml.builder.js';
import {
  handleVoice,
  handleGather,
<<<<<<< HEAD
  handleGatherResult,
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  handleStatus,
  handleHealth,
} from './voice.controller.js';
import { saveAudio } from '../../services/audio.utils.js';

export const voiceRouter = Router();

// ── TwiML headers on every response from this router ─────────────────────────
voiceRouter.use((_req, res, next) => {
  res.set(TWIML_HEADERS);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

<<<<<<< HEAD
// Wrappers forward unhandled rejections to Express error handler via next().
// Without .catch(next), async throws become unhandled promise rejections and
// the client hangs (no response, no timeout reset).
voiceRouter.post('/voice', (req, res, next) => handleVoice(req, res, saveAudio).catch(next));
voiceRouter.post('/gather', (req, res, next) => handleGather(req, res, saveAudio).catch(next));
voiceRouter.post('/gather-result', (req, res, next) => handleGatherResult(req, res).catch(next));
voiceRouter.post('/status', (req, res, next) => handleStatus(req, res).catch(next));
voiceRouter.get('/health', (req, res) => handleHealth(req, res));
=======
voiceRouter.post('/voice',  (req, res) => handleVoice(req, res, saveAudio));
voiceRouter.post('/gather', (req, res) => handleGather(req, res, saveAudio));
voiceRouter.post('/status', (req, res) => handleStatus(req, res));
voiceRouter.get ('/health', (req, res) => handleHealth(req, res));
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
