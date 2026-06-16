// src/features/audit/audit.service.js — Audit trail for agent operations.
// Best-effort writes — failures are logged but never propagated to callers.

import { childLogger } from '../../core/logger.js';
import { db, dbAvailable } from '../../infra/db/dbClient.js';

const log = childLogger('audit');

/**
 * Write an audit log entry.
 * @param {object} entry
 * @param {string} entry.phoneNumber
 * @param {string} entry.callSid
 * @param {string} entry.action
 * @param {string} [entry.intent]
 * @param {object} [entry.requestData]
 * @param {object} [entry.responseData]
 * @param {string} [entry.status]
 * @param {number} [entry.latencyMs]
 * @param {string} [entry.errorMessage]
 * @param {string} [entry.errorCode]
 */
export async function writeAuditLog(entry) {
  if (!dbAvailable) {
    log.debug(entry, 'Audit log (no DB)');
    return;
  }
  try {
    await db('audit_logs').insert({
      phone_number: entry.phoneNumber,
      call_sid: entry.callSid,
      action: entry.action,
      intent: entry.intent ?? null,
      request_data: entry.requestData ? JSON.stringify(entry.requestData) : null,
      response_data: entry.responseData ? JSON.stringify(entry.responseData) : null,
      status: entry.status ?? 'unknown',
      latency_ms: entry.latencyMs ?? null,
      error_message: entry.errorMessage ?? null,
      error_code: entry.errorCode ?? null,
      created_at: new Date(),
    });
  } catch (err) {
    log.error({ err: err.message, action: entry.action }, 'Audit log write failed');
  }
}
