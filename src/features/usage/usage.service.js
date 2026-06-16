// src/features/usage/usage.service.js — Usage tracking and billing metering.
// Buffers events in memory and flushes to DB periodically or on shutdown.

import { childLogger } from '../../core/logger.js';
import { db, dbAvailable } from '../../infra/db/dbClient.js';

const log = childLogger('usage');
const _buffer = [];

/**
 * Record a usage event (voice call, SMS, API call, etc.)
 */
export function recordUsage(tenantId, type, meta = {}) {
  _buffer.push({ tenantId, type, meta, timestamp: new Date() });
}

/**
 * Flush buffered usage events to DB.
 * Called on graceful shutdown and periodically.
 */
export async function flushUsageEvents() {
  if (_buffer.length === 0) return;
  const batch = _buffer.splice(0);
  if (!dbAvailable) {
    log.debug({ count: batch.length }, 'Usage events discarded (no DB)');
    return;
  }
  try {
    await db('usage_events').insert(
      batch.map(e => ({
        tenant_id: e.tenantId ?? 'default',
        event_type: e.type,
        meta: JSON.stringify(e.meta),
        created_at: e.timestamp,
      }))
    );
    log.info({ count: batch.length }, 'Usage events flushed');
  } catch (err) {
    log.error({ err: err.message, count: batch.length }, 'Usage flush failed');
  }
}

/**
 * Get usage summary for a tenant.
 */
export async function getUsageSummary({ tenantId, from, to, groupBy: _groupBy = 'day' } = {}) {
  if (!dbAvailable) return [];
  try {
    let query = db('usage_events').where({ tenant_id: tenantId ?? 'default' });
    if (from) query = query.where('created_at', '>=', from);
    if (to) query = query.where('created_at', '<=', to);
    return query.select('event_type', db.raw('count(*) as count')).groupBy('event_type');
  } catch (err) {
    log.error({ err: err.message }, 'Usage summary failed');
    return [];
  }
}
