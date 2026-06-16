// src/features/sms/sms.router.js — Express router for Twilio SMS webhook.
// Mounts at /twilio (same prefix as voice — Twilio sends to /twilio/sms).

import { Router } from 'express';
import { handleSms } from './sms.controller.js';

export const smsRouter = Router();

smsRouter.post('/sms', handleSms);
