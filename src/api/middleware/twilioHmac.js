// src/api/middleware/twilioHmac.js — Twilio HMAC-SHA1 request verification.
// Always enforced in production; passthrough in dev/test when auth token is absent.
// Reference: https://www.twilio.com/docs/usage/security#validating-signatures

<<<<<<< HEAD
import crypto from 'crypto';
import { config } from '../../core/config.js';
=======
import crypto        from 'crypto';
import { config }    from '../../core/config.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
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

<<<<<<< HEAD
  const sig = req.headers['x-twilio-signature'] ?? '';
  const url = `${config.BASE_URL}${req.originalUrl}`;
  const params = req.body ?? {};

  // Build canonical string: url + sorted param key+value pairs
  const canonical = Object.keys(params)
    .sort()
=======
  const sig      = req.headers['x-twilio-signature'] ?? '';
  const url      = `${config.BASE_URL}${req.originalUrl}`;
  const params   = req.body ?? {};

  // Build canonical string: url + sorted param key+value pairs
  const canonical = Object.keys(params).sort()
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    .reduce((acc, k) => acc + k + params[k], url);

  const expected = crypto
    .createHmac('sha1', config.TWILIO_AUTH_TOKEN)
    .update(canonical)
    .digest('base64');

<<<<<<< HEAD
  // Constant-time comparison to prevent timing attacks.
  // timingSafeEqual requires equal-length buffers; we pad/truncate the incoming
  // signature against the expected length so a missing header doesn't throw.
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.alloc(expectedBuf.length); // zero-filled
  Buffer.from(sig).copy(sigBuf, 0, 0, sigBuf.length);

  // Check length separately (before timingSafeEqual) so an attacker can't infer
  // length from timing differences, but a legitimate mismatch is still caught.
  const valid = sig.length === expected.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
=======
  // Constant-time comparison to prevent timing attacks
  const sigBuf      = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);

  const valid =
    sigBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(sigBuf, expectedBuf);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  if (!valid) {
    log.warn({ url, sigPrefix: sig.slice(0, 8) }, 'Invalid Twilio signature — rejected');
    return res.status(401).type('text/xml').send(twimlError());
  }

  next();
}
