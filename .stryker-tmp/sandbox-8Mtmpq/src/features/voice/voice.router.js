// @ts-nocheck
// src/features/voice/voice.router.js — Express router for Twilio voice webhooks.
// Mounts at /twilio (configured in src/api/router.js).
// Applies: TwiML headers, HMAC verification, body validation.

import { Router }    from 'express';
import { config }    from '../../core/config.js';
import { TWIML_HEADERS } from './twiml.builder.js';
import {
  handleVoice,
  handleGather,
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

voiceRouter.post('/voice',  (req, res) => handleVoice(req, res, saveAudio));
voiceRouter.post('/gather', (req, res) => handleGather(req, res, saveAudio));
voiceRouter.post('/status', (req, res) => handleStatus(req, res));
voiceRouter.get ('/health', (req, res) => handleHealth(req, res));
