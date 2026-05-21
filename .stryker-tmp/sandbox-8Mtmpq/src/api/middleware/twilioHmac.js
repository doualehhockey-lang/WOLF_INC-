// @ts-nocheck
// src/api/middleware/twilioHmac.js — Twilio HMAC-SHA1 request verification.
// Always enforced in production; passthrough in dev/test when auth token is absent.
// Reference: https://www.twilio.com/docs/usage/security#validating-signatures

import crypto        from 'crypto';
import { config }    from '../../core/config.js';
import { childLogger } from '../../core/logger.js';
import { twimlError } from '../../features/voice/twiml.builder.js';

const log = childLogger('hmac');

/**
 * Express middleware — verify the X-Twilio-Signature header.
 * Rejects with 401 TwiML on failure (Twilio expects XML, not JSON).
 */
export function twilioHmac(req, res, next) {
  // Skip in non-production or when no auth token configured
  if (config.NODE_ENV !== 'production' || !config.TWILIO_AUTH_TOKEN) {
    return next();
  }

  const sig      = req.headers['x-twilio-signature'] ?? '';
  const url      = `${config.BASE_URL}${req.originalUrl}`;
  const params   = req.body ?? {};

  // Build canonical string: url + sorted param key+value pairs
  const canonical = Object.keys(params).sort()
    .reduce((acc, k) => acc + k + params[k], url);

  const expected = crypto
    .createHmac('sha1', config.TWILIO_AUTH_TOKEN)
    .update(canonical)
    .digest('base64');

  // Constant-time comparison to prevent timing attacks
  const sigBuf      = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);

  const valid =
    sigBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(sigBuf, expectedBuf);

  if (!valid) {
    log.warn({ url, sigPrefix: sig.slice(0, 8) }, 'Invalid Twilio signature — rejected');
    return res.status(401).type('text/xml').send(twimlError());
  }

  next();
}
