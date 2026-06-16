// src/features/agent/agent.service.js — Event dispatch layer.
// Routes to PostgreSQL store (when available) or JSON file store (fallback).
// Records latency and intent counters via Prometheus.
// Writes to audit_logs on every dispatch.

import { childLogger } from '../../core/logger.js';
import { agentLatency, intentCounter, errorCounter } from '../../core/metrics.js';
import { dbAvailable } from '../../infra/db/dbClient.js';
import { normalizeIntent } from './intent.normalizer.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { t } from '../../core/i18n.js';
import * as dbStore from './db.store.js';
import * as jsonStore from './json.store.js';

const log = childLogger('agent');

log.info(
  { backend: dbAvailable ? 'postgresql' : 'json' },
  'Agent store initial backend (live-selected per request)'
);

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Route a parsed NLU result to the appropriate CRUD handler.
 * @param {import('../nlu/nlu.service.js').NluResult} nluResult
 * @param {string} userKey — tokenized phone or callSid
 * @param {{ phoneNumber?: string, callSid?: string, lang?: string }} ctx
 * @returns {Promise<{ok:boolean, message:string}>}
 */
export async function dispatch(nluResult, userKey = 'global', ctx = {}) {
  const intent = normalizeIntent(nluResult.intent);
  const timer = agentLatency.startTimer({ intent });
  const startedAt = Date.now();
  const lang = ctx.lang ?? 'fr'; // default to French (app origin); callers override via ctx.lang
  let success = 'true';

  try {
    const result = await _handle({ ...nluResult, intent }, userKey, lang);
    intentCounter.inc({ intent, resolved: result.ok ? 'true' : 'false' });

    // Audit log is best-effort — a write failure must NOT corrupt the caller's
    // view of the operation.  The calendar event was already created/cancelled;
    // re-throwing here would cause the voice/SMS pipeline to report an error to
    // the user even though their request succeeded.
    try {
      await writeAuditLog({
        phoneNumber: ctx.phoneNumber,
        callSid: ctx.callSid,
        action: 'agent_dispatch',
        intent,
        requestData: { subject: nluResult.subject, isoDate: nluResult.isoDate },
        responseData: { ok: result.ok },
        status: 'success',
        latencyMs: Date.now() - startedAt,
      });
    } catch (auditErr) {
      log.error(
        { err: auditErr.message, intent },
        'Audit log write failed — calendar operation succeeded'
      );
    }

    return result;
  } catch (err) {
    success = 'false';
    errorCounter.inc({ service: 'agent', errorType: err.code ?? 'unknown' });
    log.error({ err: err.message, intent, userKey }, 'Agent dispatch failed');

    await writeAuditLog({
      phoneNumber: ctx.phoneNumber,
      callSid: ctx.callSid,
      action: 'agent_dispatch',
      intent,
      status: 'error',
      latencyMs: Date.now() - startedAt,
      errorMessage: err.message,
      errorCode: err.code,
    });

    throw err;
  } finally {
    timer({ success });
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function _handle({ intent, subject, isoDate, isoTime, date, time }, userKey, lang = 'en') {
  // Re-check dbAvailable on every call so the store adapts to live DB state.
  // The import binding is live (ESM let export) — this reflects the current value
  // without incurring a re-import cost on every request.
  const store = dbAvailable ? dbStore : jsonStore;

  const effectiveDate = isoDate || date;
  const effectiveTime = isoTime || time;

  switch (intent) {
    case 'create_event': {
      if (!effectiveDate) return { ok: false, message: t('agent.missing_date', {}, lang) };
      const event = await store.createEvent(userKey, {
        subject: subject || t('agent.event_created', { date: '', time: '' }, lang),
        date: effectiveDate,
        time: effectiveTime || '00:00',
      });
      return {
        ok: true,
        message: t(
          'agent.event_created',
          { subject: event.subject, date: event.date, time: event.time },
          lang
        ),
      };
    }

    case 'cancel_event': {
      const events = await store.listEvents(userKey);
      if (!events.length) return { ok: true, message: t('agent.no_events', {}, lang) };

      let target = effectiveDate ? await store.findEventByDate(userKey, effectiveDate) : null;
      if (!target && subject) target = await store.findEventBySubject(userKey, subject);
      if (!target) target = events[events.length - 1];

      await store.softDeleteEvent(userKey, target.id);
      return {
        ok: true,
        message: t(
          'agent.event_cancelled',
          { subject: target.subject, date: target.date, time: target.time },
          lang
        ),
      };
    }

    case 'update_event': {
      const events = await store.listEvents(userKey);
      if (!events.length) return { ok: true, message: t('agent.no_events', {}, lang) };

      let target = effectiveDate ? await store.findEventByDate(userKey, effectiveDate) : null;
      if (!target && subject) target = await store.findEventBySubject(userKey, subject);
      if (!target) target = events[events.length - 1];

      const patch = {};
      if (effectiveDate) patch.date = effectiveDate;
      if (effectiveTime) patch.time = effectiveTime;
      if (subject) patch.subject = subject;

      const updated = await store.updateEvent(userKey, target.id, patch);
      const ev = updated ?? target;
      return {
        ok: true,
        message: t(
          'agent.event_updated',
          { subject: ev.subject, date: ev.date, time: ev.time },
          lang
        ),
      };
    }

    case 'list_events': {
      const events = await store.listEvents(userKey);
      if (!events.length) return { ok: true, message: t('agent.no_events', {}, lang) };
      const list = events.map(e => `- ${e.subject} ${e.date} ${e.time}`).join('\n');
      return {
        ok: true,
        message: `${t('agent.events_listed', { count: events.length }, lang)}\n${list}`,
      };
    }

    default:
      return { ok: false, message: t('agent.unknown_intent', {}, lang) };
  }
}
