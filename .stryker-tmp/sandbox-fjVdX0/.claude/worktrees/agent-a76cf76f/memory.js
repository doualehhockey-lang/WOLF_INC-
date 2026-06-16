// @ts-nocheck
// src/services/memory.js
// Mémoire conversationnelle par appel Twilio (CallSid).
//
// Résout le problème des requêtes implicites multi-tours :
//   Tour 1 : "j'ai un rdv demain à 14h"
//   Tour 2 : "annule-le"   → sans mémoire = intent:unknown
//            avec mémoire  → contexte injecté dans Ollama = intent:cancel_event
//
// Chaque session expire après TTL_MS d'inactivité (défaut 15 min).

'use strict';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

/**
 * @typedef {Object} Turn
 * @property {'user'|'agent'}  role
 * @property {string}          content      - texte brut
 * @property {string}          [intent]     - intent détecté
 * @property {string}          [isoDate]
 * @property {string}          [isoTime]
 * @property {string}          [subject]
 * @property {number}          ts           - timestamp
 */

/**
 * @typedef {Object} Session
 * @property {string}          callSid
 * @property {Turn[]}          turns
 * @property {number}          lastActivity
 * @property {string}          [pendingIntent]  - intent en attente de complétion
 * @property {string}          [pendingDate]
 * @property {string}          [pendingTime]
 * @property {string}          [pendingSubject]
 */

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════

const TTL_MS    = 15 * 60 * 1000;  // 15 minutes d'inactivité
const MAX_TURNS = 6;                // Nombre maximum de tours conservés par session

// ═══════════════════════════════════════════════════════════
// STORE EN MÉMOIRE
// ═══════════════════════════════════════════════════════════

/** @type {Map<string, Session>} */
const _store = new Map();

// Nettoyage automatique toutes les 5 minutes
setInterval(() => cleanup(), 5 * 60 * 1000).unref();

function cleanup() {
  const now  = Date.now();
  let pruned = 0;
  for (const [sid, session] of _store.entries()) {
    if (now - session.lastActivity > TTL_MS) {
      _store.delete(sid);
      pruned++;
    }
  }
  if (pruned > 0) console.log(`[Memory] Sessions expirées nettoyées : ${pruned}`);
}

// ═══════════════════════════════════════════════════════════
// API PUBLIQUE
// ═══════════════════════════════════════════════════════════

/**
 * Récupère ou crée une session pour un CallSid.
 * @param {string} callSid
 * @returns {Session}
 */
export function getSession(callSid) {
  if (!_store.has(callSid)) {
    _store.set(callSid, {
      callSid,
      turns:          [],
      lastActivity:   Date.now(),
      lang:           'fr',   // detected language — 'fr' or 'en'
      pendingIntent:  null,
      pendingDate:    null,
      pendingTime:    null,
      pendingSubject: null,
    });
  }
  const session       = _store.get(callSid);
  session.lastActivity = Date.now();
  return session;
}

/**
 * Ajoute un tour utilisateur à la session.
 * @param {string} callSid
 * @param {string} content
 */
export function addUserTurn(callSid, content) {
  const session = getSession(callSid);
  _addTurn(session, { role: 'user', content });
}

/**
 * Ajoute un tour agent avec les entités extraites.
 * @param {string} callSid
 * @param {string} content       - réponse textuelle de l'agent
 * @param {Object} [nluResult]   - résultat NLU associé
 */
export function addAgentTurn(callSid, content, nluResult = {}) {
  const session = getSession(callSid);
  _addTurn(session, {
    role:    'agent',
    content,
    intent:  nluResult.intent,
    isoDate: nluResult.isoDate,
    isoTime: nluResult.isoTime,
    subject: nluResult.subject,
  });

  // Met à jour le contexte pending pour le tour suivant
  if (nluResult.intent && nluResult.intent !== 'unknown') {
    session.pendingIntent  = nluResult.intent;
    session.pendingDate    = nluResult.isoDate  ?? session.pendingDate;
    session.pendingTime    = nluResult.isoTime  ?? session.pendingTime;
    session.pendingSubject = nluResult.subject  ?? session.pendingSubject;
  }
}

/**
 * Construit le bloc de contexte à injecter dans le prompt Ollama.
 * Format lisible par le LLM pour résoudre les références implicites.
 *
 * @param {string} callSid
 * @returns {string} contexte formaté, vide si aucun historique
 */
export function buildContext(callSid) {
  if (!_store.has(callSid)) return '';

  const session = _store.get(callSid);
  if (!session.turns.length) return '';

  const lines = session.turns.map(t => {
    const speaker = t.role === 'user' ? 'UTILISATEUR' : 'AGENT';
    return `[${speaker}]: ${t.content}`;
  });

  let ctx = `Contexte de la conversation en cours :\n${lines.join('\n')}`;

  // Ajoute le résumé du dernier état connu (aide le LLM pour les références)
  if (session.pendingDate || session.pendingSubject) {
    const parts = [];
    if (session.pendingIntent)  parts.push(`intent précédent: ${session.pendingIntent}`);
    if (session.pendingDate)    parts.push(`date précédente: ${session.pendingDate}`);
    if (session.pendingTime)    parts.push(`heure précédente: ${session.pendingTime}`);
    if (session.pendingSubject) parts.push(`sujet précédent: ${session.pendingSubject}`);
    ctx += `\nContexte actif : ${parts.join(', ')}`;
  }

  return ctx;
}

/**
 * Retourne les entités du dernier intent réussi (pour résoudre les références).
 * Utile quand l'utilisateur dit "annule-le" ou "change l'heure".
 * @param {string} callSid
 * @returns {{ intent, isoDate, isoTime, subject } | null}
 */
export function getLastEntities(callSid) {
  const session = _store.get(callSid);
  if (!session) return null;
  if (!session.pendingIntent) return null;
  return {
    intent:  session.pendingIntent,
    isoDate: session.pendingDate,
    isoTime: session.pendingTime,
    subject: session.pendingSubject,
  };
}

/**
 * Détecte si le message est une réponse courte à une question fermée
 * ("oui", "non", "ok", "confirme", etc.)
 * @param {string} text
 * @returns {'confirm'|'deny'|null}
 */
export function detectShortAnswer(text) {
  if (!text) return null;
  const s = text.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const YES = ['oui', 'yes', 'ok', 'ouais', 'bien sur', 'parfait',
               'confirme', 'valide', 'c\'est ca', 'exactement', 'd\'accord', 'dac'];
  const NO  = ['non', 'no', 'nan', 'pas du tout', 'annule', 'laisse tomber', 'jamais'];

  if (YES.some(w => s === w || s.startsWith(w + ' '))) return 'confirm';
  if (NO.some(w  => s === w || s.startsWith(w + ' '))) return 'deny';
  return null;
}

/**
 * Set the detected language for a session.
 * @param {string} callSid
 * @param {'fr'|'en'} lang
 */
export function setLang(callSid, lang) {
  const session = getSession(callSid);
  session.lang = lang;
}

/**
 * Get the detected language for a session.
 * @param {string} callSid
 * @returns {'fr'|'en'}
 */
export function getLang(callSid) {
  return _store.get(callSid)?.lang ?? 'fr';
}

/**
 * Supprime une session (fin d'appel).
 * @param {string} callSid
 */
export function clearSession(callSid) {
  _store.delete(callSid);
}

/**
 * Statistiques (pour monitoring)
 */
export function getStats() {
  return {
    activeSessions: _store.size,
    sessions: [..._store.values()].map(s => ({
      callSid:       s.callSid.slice(-8),
      turns:         s.turns.length,
      pendingIntent: s.pendingIntent,
      lastActivity:  new Date(s.lastActivity).toISOString(),
    })),
  };
}

// ─── Helpers privés ───────────────────────────────────────────────────────────

function _addTurn(session, turn) {
  session.turns.push({ ...turn, ts: Date.now() });
  // Fenêtre glissante : garde seulement les MAX_TURNS derniers tours
  if (session.turns.length > MAX_TURNS) {
    session.turns.splice(0, session.turns.length - MAX_TURNS);
  }
  session.lastActivity = Date.now();
}