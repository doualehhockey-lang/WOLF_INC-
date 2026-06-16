// repositories/audit.repository.js
// Append-only audit log — records every intent, outcome, and latency.
// Used for debugging, compliance, and business analytics.
//
// Migration 004 columns: request_id, provider, nlu_strategy, feature_flags,
// ip_hash, session_turn, model_id, tokens_input, tokens_output.
// Gate: AUDIT_LOG feature flag — set to '0' in Redis to silence all writes.

<<<<<<< HEAD
import { createHash } from 'crypto';
import { db } from '../config/database.js';
import { childLogger } from '../utils/logger.js';
=======
import { createHash }              from 'crypto';
import { db }                      from '../config/database.js';
import { childLogger }             from '../utils/logger.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import { isEnabled, snapshotFlags, FLAGS } from '../src/core/featureFlags.js';

const log = childLogger('audit.repository');

/**
 * @param {{
 *   phoneNumber: string,  callSid?: string,   action: string,
 *   intent?: string,      status: string,      latencyMs?: number,
 *   requestData?: object, responseData?: object,
 *   errorMessage?: string, errorCode?: string,
 *   // Migration 004
 *   requestId?: string,  provider?: string,  nluStrategy?: string,
 *   ip?: string,         sessionTurn?: number,
 *   modelId?: string,    tokensInput?: number, tokensOutput?: number,
 * }} entry
 */
export async function logAudit(entry) {
  // Kill switch — disable all audit writes without a restart
<<<<<<< HEAD
  if (!(await isEnabled(FLAGS.AUDIT_LOG))) return;
=======
  if (!await isEnabled(FLAGS.AUDIT_LOG)) return;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  try {
    // Feature flag snapshot — reflects state at request time
    const featureFlags = snapshotFlags();
    // GDPR-safe client fingerprint (SHA-256 truncated to 12 hex chars)
    const ipHash = _hashIp(entry.ip ?? entry.phoneNumber);

    await db('audit_logs').insert({
      // Original columns
<<<<<<< HEAD
      phone_number: entry.phoneNumber,
      call_sid: entry.callSid ?? null,
      action: entry.action,
      intent: entry.intent ?? null,
      request_data: entry.requestData ? JSON.stringify(entry.requestData) : null,
      response_data: entry.responseData ? JSON.stringify(entry.responseData) : null,
      status: entry.status,
      latency_ms: entry.latencyMs ?? null,
      error_message: entry.errorMessage ?? null,
      error_code: entry.errorCode ?? null,
      // Migration 004 columns
      request_id: entry.requestId ?? null,
      provider: entry.provider ?? null,
      nlu_strategy: entry.nluStrategy ?? null,
      feature_flags: JSON.stringify(featureFlags),
      ip_hash: ipHash,
      session_turn: entry.sessionTurn ?? null,
      model_id: entry.modelId ?? null,
      tokens_input: entry.tokensInput ?? null,
=======
      phone_number:  entry.phoneNumber,
      call_sid:      entry.callSid      ?? null,
      action:        entry.action,
      intent:        entry.intent       ?? null,
      request_data:  entry.requestData  ? JSON.stringify(entry.requestData)  : null,
      response_data: entry.responseData ? JSON.stringify(entry.responseData) : null,
      status:        entry.status,
      latency_ms:    entry.latencyMs    ?? null,
      error_message: entry.errorMessage ?? null,
      error_code:    entry.errorCode    ?? null,
      // Migration 004 columns
      request_id:    entry.requestId    ?? null,
      provider:      entry.provider     ?? null,
      nlu_strategy:  entry.nluStrategy  ?? null,
      feature_flags: JSON.stringify(featureFlags),
      ip_hash:       ipHash,
      session_turn:  entry.sessionTurn  ?? null,
      model_id:      entry.modelId      ?? null,
      tokens_input:  entry.tokensInput  ?? null,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      tokens_output: entry.tokensOutput ?? null,
    });
  } catch (err) {
    // Audit failure must never crash the main pipeline — log and swallow
    log.error({ err: err.message, entry }, 'Failed to write audit log');
  }
}

/** GDPR-safe fingerprint: SHA-256 of value, truncated to 12 hex chars. */
function _hashIp(value) {
  if (!value) return null;
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

export async function getAuditLogs(phoneNumber, { limit = 100, offset = 0 } = {}) {
  return db('audit_logs')
    .where({ phone_number: phoneNumber })
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);
}

export async function getErrorRate(windowMinutes = 60) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const rows = await db('audit_logs')
    .where('created_at', '>=', since)
    .select('status')
    .count('* as count')
    .groupBy('status');

  const total = rows.reduce((n, r) => n + Number(r.count), 0);
  const errors = rows.find(r => r.status === 'error');
  return total > 0 ? Number(errors?.count ?? 0) / total : 0;
}
