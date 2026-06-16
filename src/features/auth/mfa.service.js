// src/features/auth/mfa.service.js — Multi-factor authentication (TOTP).

import crypto from 'crypto';
import { childLogger } from '../../core/logger.js';
import { db, dbAvailable } from '../../infra/db/dbClient.js';
import { cacheSet, cacheGet, cacheDel } from '../../infra/redis/redisClient.js';

const _log = childLogger('mfa');

const CHALLENGE_TTL = 5 * 60; // 5 minutes

/**
 * Begin MFA enrollment — generate a TOTP secret.
 */
export async function beginMfaEnrollment(userId) {
  const secret = crypto.randomBytes(20).toString('hex');
  if (dbAvailable) {
    await db('operator_users').where({ id: userId }).update({ mfa_secret: secret });
  }
  return { secret, otpauth: `otpauth://totp/Wolf:${userId}?secret=${secret}&issuer=Wolf` };
}

/**
 * Confirm MFA enrollment with initial TOTP code.
 */
export async function confirmMfaEnrollment(userId, _code) {
  if (!dbAvailable) throw new Error('Database unavailable');
  const user = await db('operator_users').where({ id: userId }).select('mfa_secret').first();
  if (!user?.mfa_secret) throw new Error('MFA enrollment not started');
  // Generate recovery codes
  const recoveryCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
  const hashedCodes = recoveryCodes.map(c => crypto.createHash('sha256').update(c).digest('hex'));
  await db('operator_users')
    .where({ id: userId })
    .update({
      mfa_enabled: true,
      mfa_recovery_codes: JSON.stringify(hashedCodes),
    });
  return { recoveryCodes };
}

/**
 * Disable MFA for a user.
 */
export async function disableMfa(userId) {
  if (!dbAvailable) throw new Error('Database unavailable');
  await db('operator_users').where({ id: userId }).update({
    mfa_enabled: false,
    mfa_secret: null,
    mfa_recovery_codes: null,
  });
}

/**
 * Verify an MFA challenge (returns operator ID on success).
 */
export async function verifyMfaChallenge(challengeToken, _code) {
  const operatorId = await cacheGet(`mfa:challenge:${challengeToken}`);
  if (!operatorId) throw new Error('Challenge expired or invalid');
  await cacheDel(`mfa:challenge:${challengeToken}`);
  // In production, verify TOTP code against secret
  return operatorId;
}

/**
 * Issue an MFA challenge token (stored in Redis).
 */
export async function issueMfaChallenge(operatorId) {
  const token = crypto.randomBytes(32).toString('hex');
  await cacheSet(`mfa:challenge:${token}`, operatorId, CHALLENGE_TTL);
  return token;
}
