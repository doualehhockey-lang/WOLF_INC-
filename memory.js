// memory.js — v3
// Mémoire conversationnelle par appel Twilio (CallSid).
// Stockage Redis si disponible, sinon Map en mémoire.
// Sessions expirent après TTL_SEC d'inactivité (défaut 15 min).

'use strict';

import { childLogger } from './utils/logger.js';
import { cacheGet, cacheSet, cacheDel } from './utils/redis.js';

const log = childLogger('memory');
const TTL_SEC = 15 * 60; // 15 minutes
const MAX_TURNS = 6;

// In-memory fallback store (used when Redis unavailable)
/** @type {Map<string, import('./memory.js').Session>} */
const _store = new Map();

// Cleanup expired in-memory sessions every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    let pruned = 0;
    for (const [sid, s] of _store) {
      if (now - s.lastActivity > TTL_SEC * 1000) {
        _store.delete(sid);
        pruned++;
      }
    }
    if (pruned > 0) log.debug({ pruned }, 'Expired in-memory sessions cleaned');
  },
  5 * 60 * 1000
).unref();

// ── Serialization helpers ─────────────────────────────────────────────────────

function _sessionKey(callSid) {
  return `session:${callSid}`;
}

function _defaultSession(callSid) {
  return {
    callSid,
    turns: [],
    lang: 'fr',
    pendingIntent: null,
    pendingDate: null,
    pendingTime: null,
    pendingSubject: null,
    lastActivity: Date.now(),
  };
}

// ── Core get/save (Redis-aware) ───────────────────────────────────────────────

async function _getSession(callSid) {
  const key = _sessionKey(callSid);

  // Try Redis first
  const raw = await cacheGet(key).catch(() => null);
  if (raw) {
    try {
      const s = JSON.parse(raw);
      s.lastActivity = Date.now();
      return s;
    } catch {
      /* corrupt — recreate */
    }
  }

  // Fallback to in-memory store
  if (_store.has(callSid)) {
    const s = _store.get(callSid);
    s.lastActivity = Date.now();
    return s;
  }

  return _defaultSession(callSid);
}

async function _saveSession(session) {
  const key = _sessionKey(session.callSid);
  session.lastActivity = Date.now();

  // Try Redis
  await cacheSet(key, JSON.stringify(session), TTL_SEC).catch(err =>
    log.warn({ err: err.message }, 'Redis session save failed — using memory fallback')
  );

  // Always update in-memory as well (instant reads, no async)
  _store.set(session.callSid, session);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getSession(callSid) {
  const session = await _getSession(callSid);
  return session;
}

export async function addUserTurn(callSid, content) {
  const session = await _getSession(callSid);
  _addTurn(session, { role: 'user', content });
  await _saveSession(session);
}

export async function addAgentTurn(callSid, content, nluResult = {}) {
  const session = await _getSession(callSid);
  _addTurn(session, {
    role: 'agent',
    content,
    intent: nluResult.intent,
    isoDate: nluResult.isoDate,
    isoTime: nluResult.isoTime,
    subject: nluResult.subject,
  });

  if (nluResult.intent && nluResult.intent !== 'unknown') {
    session.pendingIntent = nluResult.intent;
    session.pendingDate = nluResult.isoDate ?? session.pendingDate;
    session.pendingTime = nluResult.isoTime ?? session.pendingTime;
    session.pendingSubject = nluResult.subject ?? session.pendingSubject;
  }
  await _saveSession(session);
}

export async function buildContext(callSid) {
  const session = await _getSession(callSid);
  if (!session.turns.length) return '';

  const lines = session.turns.map(
    t => `[${t.role === 'user' ? 'UTILISATEUR' : 'AGENT'}]: ${t.content}`
  );
  let ctx = `Contexte de la conversation en cours :\n${lines.join('\n')}`;

  if (session.pendingDate || session.pendingSubject) {
    const parts = [];
    if (session.pendingIntent) parts.push(`intent précédent: ${session.pendingIntent}`);
    if (session.pendingDate) parts.push(`date précédente: ${session.pendingDate}`);
    if (session.pendingTime) parts.push(`heure précédente: ${session.pendingTime}`);
    if (session.pendingSubject) parts.push(`sujet précédent: ${session.pendingSubject}`);
    ctx += `\nContexte actif : ${parts.join(', ')}`;
  }
  return ctx;
}

export async function getLastEntities(callSid) {
  const session = await _getSession(callSid);
  if (!session.pendingIntent) return null;
  return {
    intent: session.pendingIntent,
    isoDate: session.pendingDate,
    isoTime: session.pendingTime,
    subject: session.pendingSubject,
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
  const session = await _getSession(callSid);
  session.lang = lang;
  await _saveSession(session);
}

export async function getLang(callSid) {
  const session = await _getSession(callSid).catch(() => null);
  return session?.lang ?? 'fr';
}

export async function clearSession(callSid) {
  await cacheDel(_sessionKey(callSid)).catch(() => {});
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

// ── Private helpers ───────────────────────────────────────────────────────────

function _addTurn(session, turn) {
  session.turns.push({ ...turn, ts: Date.now() });
  if (session.turns.length > MAX_TURNS) {
    session.turns.splice(0, session.turns.length - MAX_TURNS);
  }
  session.lastActivity = Date.now();
}
