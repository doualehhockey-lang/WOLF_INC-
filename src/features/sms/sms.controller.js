// src/features/sms/sms.controller.js — SMS webhook handler.
<<<<<<< HEAD
//
// Validates input, enforces rate limit, delegates to the full NLU pipeline.
// Pipeline: NLU (Claude → Ollama → regex) → agent dispatch → <Message> reply.
// Session context stored in Redis at sms:session:<phone> (15-min sliding TTL).

import { childLogger } from '../../core/logger.js';
import { smsTotal, errorCounter } from '../../core/metrics.js';
import { isEnabled, FLAGS } from '../../core/featureFlags.js';
import { isRateLimited } from '../voice/rate-limiter.js';
import { sanitizeText } from '../../api/middleware/validation.js';
import { runSmsPipeline } from './sms.pipeline.js';
import { db, dbAvailable } from '../../infra/db/dbClient.js';
import { notifyStaff } from '../notifications/notification.service.js';

const log = childLogger('sms');

// ── TwiML helpers ─────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

=======
// Validates input, enforces rate limit, delegates to auto-responder.

import { childLogger }                    from '../../core/logger.js';
import { smsTotal, errorCounter }         from '../../core/metrics.js';
import { isEnabled, FLAGS }               from '../../core/featureFlags.js';
import { isRateLimited }                  from '../voice/rate-limiter.js';
import { autoReply }                      from '../responder/responder.service.js';
import { sanitizeText }                   from '../../api/middleware/validation.js';

const log = childLogger('sms');

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
function _xml(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

function _message(text) {
  return _xml(`<Message>${_esc(text)}</Message>`);
}

<<<<<<< HEAD
function _empty() {
  return _xml('');
=======
function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}

// ── POST /twilio/sms ──────────────────────────────────────────────────────────

<<<<<<< HEAD
export async function handleSms(req, res, _next) {
  const { Body: rawBody = '', From: from = 'unknown', MessageSid: sid = 'unknown' } = req.body;

  const body = sanitizeText(rawBody, 1_600);

  log.info({ sid, from: '[REDACTED]', bodyLen: body?.length }, 'SMS received');
=======
export async function handleSms(req, res) {
  const { Body: rawBody = '', From: from = 'unknown' } = req.body;
  const body = sanitizeText(rawBody, 1_600);

  log.info({ from, body: body?.slice(0, 80) }, 'SMS received');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  smsTotal.inc();

  res.set('Content-Type', 'text/xml; charset=utf-8');

<<<<<<< HEAD
  // Kill switch — disable SMS pipeline without restart.
  if (!(await isEnabled(FLAGS.PIPELINE_SMS))) {
    log.warn({ sid }, 'PIPELINE_SMS flag disabled — dropping message');
    return res.send(_empty());
  }

  if (!body) return res.send(_empty());

  // Handle cancellation keywords: ANNULER / CANCEL
  const normalizedBody = body.trim().toUpperCase();
  if (normalizedBody === 'ANNULER' || normalizedBody === 'CANCEL') {
    try {
      const cancelReply = await _handleCancellation(from);
      return res.send(_message(cancelReply));
    } catch (err) {
      log.error({ err: err.message, sid }, 'SMS cancellation handling failed');
      return res.send(_message('Une erreur est survenue. Veuillez reessayer.'));
    }
  }

  // Rate limit by phone number.
  if (await isRateLimited(from)) {
    log.warn({ sid }, 'SMS rate limited');
    return res.send(_message('Too many messages. Please wait a minute before trying again.'));
  }

  try {
    const reply = await runSmsPipeline({ text: body, from, sid });
    log.info({ sid, replyLen: reply?.length }, 'SMS reply sent');
    res.send(_message(reply));
  } catch (err) {
    log.error({ err: err.message, sid }, 'SMS pipeline failed');
    errorCounter.inc({ service: 'sms', errorType: 'pipeline_failed' });
    // Don't propagate — Twilio needs a TwiML response or it retries.
    res.send(_message('Service temporarily unavailable. Please try again.'));
  }
}

// ── SMS cancellation handler ─────────────────────────────────────────────────

/**
 * Handle "ANNULER" / "CANCEL" SMS — find the next upcoming event for this phone
 * number and soft-cancel it.
 * @param {string} phoneNumber — sender E.164 phone number
 * @returns {Promise<string>} reply text
 */
async function _handleCancellation(phoneNumber) {
  if (!dbAvailable || !db) {
    return 'Service indisponible. Veuillez rappeler pour annuler votre RDV.';
  }

  const now = new Date();
  const nowDate = now.toISOString().slice(0, 10);
  const nowTime = now.toISOString().slice(11, 16);

  // Find the next upcoming event for this phone number.
  const event = await db('events')
    .whereNull('deleted_at')
    .whereNot('status', 'cancelled')
    .where('client_phone', phoneNumber)
    .where(function () {
      this.where('date', '>', nowDate).orWhere(function () {
        this.where('date', '=', nowDate).where('time', '>=', nowTime);
      });
    })
    .orderBy([
      { column: 'date', order: 'asc' },
      { column: 'time', order: 'asc' },
    ])
    .first('id', 'tenant_id', 'subject', 'date', 'time', 'user_key', 'client_phone');

  if (!event) {
    return 'Aucun rendez-vous a venir trouve pour votre numero.';
  }

  // Soft-cancel the event.
  await db('events').where('id', event.id).update({ status: 'cancelled', deleted_at: db.fn.now() });

  log.info({ eventId: event.id, phone: '[REDACTED]' }, 'Event cancelled via SMS');

  // Notify staff (fire-and-forget).
  notifyStaff(
    event.tenant_id || 'default',
    {
      client_name: event.user_key || 'Client',
      date: event.date,
      time: event.time,
      service: event.subject,
    },
    'cancelled'
  ).catch(err => log.warn({ err: err.message }, 'Staff notification after SMS cancel failed'));

  return 'Votre RDV a ete annule. Merci de nous avoir prevenus.';
}
=======
  // Kill switch — disable SMS pipeline without restart
  if (!await isEnabled(FLAGS.PIPELINE_SMS)) {
    log.warn({ from }, 'PIPELINE_SMS flag disabled — dropping message');
    return res.send(_xml(''));
  }

  if (!body) return res.send(_xml(''));

  if (await isRateLimited(from)) {
    return res.send(_message('Trop de messages. Réessayez dans une minute.'));
  }

  try {
    const reply = await autoReply(body);
    log.info({ from, preview: reply.slice(0, 80) }, 'SMS reply sent');
    res.send(_message(reply));
  } catch (err) {
    log.error({ err: err.message, from }, 'SMS autoReply failed');
    errorCounter.inc({ service: 'sms', errorType: 'autoreply_failed' });
    res.send(_message('Service temporairement indisponible.'));
  }
}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
