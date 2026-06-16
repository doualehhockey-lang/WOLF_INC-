// src/features/memory/memory.service.js — Conversational session store.
// Persists to Redis (with TTL) when available; falls back to in-memory Map.
// All sessions expire after TTL_SEC of inactivity (default 15 min).

import { childLogger } from '../../core/logger.js';
import { cacheGet, cacheSet, cacheDel } from '../../infra/redis/redisClient.js';
import { parseSession, defaultSession } from './session.schema.js';

const log = childLogger('memory');
const TTL_SEC = 15 * 60; // 15 minutes
const MAX_TURNS = 6;

// In-memory fallback (instant reads, survives Redis hiccups)
/** @type {Map<string, import('./session.schema.js').Session>} */
const _store = new Map();

// GC: prune expired in-memory sessions every 5 min
setInterval(
  () => {
    const cutoff = Date.now() - TTL_SEC * 1_000;
    let pruned = 0;
    for (const [sid, s] of _store) {
      if (s.lastActivity < cutoff) {
        _store.delete(sid);
        pruned++;
      }
    }
    if (pruned) log.debug({ pruned }, 'Expired sessions pruned');
  },
  5 * 60 * 1_000
).unref();

// ── Key helpers ───────────────────────────────────────────────────────────────

const _key = callSid => `session:${callSid}`;

// ── Core get / save ───────────────────────────────────────────────────────────

async function _get(callSid) {
  // 1. Redis
  const raw = await cacheGet(_key(callSid)).catch(() => null);
  if (raw) {
    try {
      const parsed = parseSession(JSON.parse(raw));
      if (parsed) {
        parsed.lastActivity = Date.now();
        return parsed;
      }
    } catch {
      /* corrupt — fall through */
    }
  }

  // 2. In-memory
  if (_store.has(callSid)) {
    const s = _store.get(callSid);
    s.lastActivity = Date.now();
    return s;
  }

  return defaultSession(callSid);
}

async function _save(session) {
  session.lastActivity = Date.now();
  await cacheSet(_key(session.callSid), JSON.stringify(session), TTL_SEC).catch(err =>
    log.warn({ err: err.message }, 'Redis session save failed — memory only')
  );
  _store.set(session.callSid, session);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getSession(callSid) {
  return _get(callSid);
}

export async function addUserTurn(callSid, content) {
  const s = await _get(callSid);
  _push(s, { role: 'user', content });
  await _save(s);
}

export async function addAgentTurn(callSid, content, nluResult = {}) {
  const s = await _get(callSid);
  _push(s, {
    role: 'agent',
    content,
    intent: nluResult.intent,
    isoDate: nluResult.isoDate ?? null,
    isoTime: nluResult.isoTime ?? null,
    subject: nluResult.subject,
  });

  if (nluResult.intent && nluResult.intent !== 'unknown') {
    s.pendingIntent = nluResult.intent;
    s.pendingDate = nluResult.isoDate ?? s.pendingDate;
    s.pendingTime = nluResult.isoTime ?? s.pendingTime;
    s.pendingSubject = nluResult.subject ?? s.pendingSubject;
  }
  await _save(s);
}

export async function buildContext(callSid) {
  const s = await _get(callSid);
  if (!s.turns.length) return '';

  const lines = s.turns.map(t => `[${t.role === 'user' ? 'UTILISATEUR' : 'AGENT'}]: ${t.content}`);
  let ctx = `Contexte de la conversation en cours :\n${lines.join('\n')}`;

  if (s.pendingDate || s.pendingSubject) {
    const parts = [];
    if (s.pendingIntent) parts.push(`intent précédent: ${s.pendingIntent}`);
    if (s.pendingDate) parts.push(`date précédente: ${s.pendingDate}`);
    if (s.pendingTime) parts.push(`heure précédente: ${s.pendingTime}`);
    if (s.pendingSubject) parts.push(`sujet précédent: ${s.pendingSubject}`);
    ctx += `\nContexte actif : ${parts.join(', ')}`;
  }
  return ctx;
}

export async function getLastEntities(callSid) {
  const s = await _get(callSid);
  if (!s.pendingIntent) return null;
  return {
    intent: s.pendingIntent,
    isoDate: s.pendingDate,
    isoTime: s.pendingTime,
    subject: s.pendingSubject,
  };
}

export function detectShortAnswer(text) {
  if (!text) return null;
  const s = text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const YES = [
    'oui',
    'yes',
    'ok',
    'ouais',
    'bien sur',
    'parfait',
    'confirme',
    'valide',
    "c'est ca",
    'exactement',
    "d'accord",
    'dac',
  ];
  const NO = ['non', 'no', 'nan', 'pas du tout', 'annule', 'laisse tomber', 'jamais'];
  if (YES.some(w => s === w || s.startsWith(w + ' '))) return 'confirm';
  if (NO.some(w => s === w || s.startsWith(w + ' '))) return 'deny';
  return null;
}

export async function setLang(callSid, lang) {
  const s = await _get(callSid);
  s.lang = lang;
  await _save(s);
}

export async function getLang(callSid) {
  const s = await _get(callSid).catch(() => null);
  return s?.lang ?? 'fr';
}

export async function clearSession(callSid) {
  await cacheDel(_key(callSid)).catch(() => {});
  _store.delete(callSid);
}

export function getStats() {
  return {
    activeSessions: _store.size,
    backend: process.env.REDIS_URL ? 'redis' : 'memory',
    sessions: [..._store.values()].map(s => ({
      callSid: s.callSid.slice(-8),
      turns: s.turns.length,
      pendingIntent: s.pendingIntent,
      lastActivity: new Date(s.lastActivity).toISOString(),
    })),
  };
}

// ── Private ───────────────────────────────────────────────────────────────────

function _push(session, turn) {
  session.turns.push({ ...turn, ts: Date.now() });
  if (session.turns.length > MAX_TURNS) {
    session.turns.splice(0, session.turns.length - MAX_TURNS);
  }
  session.lastActivity = Date.now();
}
