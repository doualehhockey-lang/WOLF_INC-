// src/features/sms/sms.router.js — Express router for Twilio SMS webhook.
// Mounts at /twilio (same prefix as voice — Twilio sends to /twilio/sms).

<<<<<<< HEAD
import { Router } from 'express';
=======
import { Router }    from 'express';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import { handleSms } from './sms.controller.js';

export const smsRouter = Router();

smsRouter.post('/sms', handleSms);
