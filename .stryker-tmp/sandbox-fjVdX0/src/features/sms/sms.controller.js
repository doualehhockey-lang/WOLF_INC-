// @ts-nocheck
// src/features/sms/sms.controller.js — SMS webhook handler.
// Validates input, enforces rate limit, delegates to auto-responder.

import { childLogger }                    from '../../core/logger.js';
import { smsTotal, errorCounter }         from '../../core/metrics.js';
import { isEnabled, FLAGS }               from '../../core/featureFlags.js';
import { isRateLimited }                  from '../voice/rate-limiter.js';
import { autoReply }                      from '../responder/responder.service.js';
import { sanitizeText }                   from '../../api/middleware/validation.js';

const log = childLogger('sms');

function _xml(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

function _message(text) {
  return _xml(`<Message>${_esc(text)}</Message>`);
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── POST /twilio/sms ──────────────────────────────────────────────────────────

export async function handleSms(req, res) {
  const { Body: rawBody = '', From: from = 'unknown' } = req.body;
  const body = sanitizeText(rawBody, 1_600);

  log.info({ from, body: body?.slice(0, 80) }, 'SMS received');
  smsTotal.inc();

  res.set('Content-Type', 'text/xml; charset=utf-8');

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
