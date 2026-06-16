// src/services/agent.js — Wolf Engine ML pipeline orchestrator.
//
// Pipeline (3 stages):
//   1. Whisper  → transcription text  (required — failure returns ok:false)
//   2. Claude   → NLU analysis        (required — failure returns ok:false)
//   3. TTS      → audio buffer        (required — failure returns ok:false)
//
// Factory pattern:  _makeAgent(deps) exported for testing with DI.
// Production entry: export const { process } = _makeAgent()

import { randomUUID } from 'crypto';
import { childLogger } from '../core/logger.js';
import { CircuitOpenError, TimeoutError } from './circuitBreaker.js';
import {
  recordAgentRequest,
  recordAgentLatency,
  recordAgentStageFailure,
  recordPipelineSuccess,
} from './metrics.js';

const log = childLogger('agent');

// ── Error classification ──────────────────────────────────────────────────────

/**
 * Classify an error into a metrics-friendly reason string.
 * @param {Error} err
 * @returns {'circuit_open'|'timeout'|'error'}
 */
function _failureReason(err) {
  if (err instanceof CircuitOpenError) return 'circuit_open';
  if (err instanceof TimeoutError) return 'timeout';
  return 'error';
}

// ── Response composer ─────────────────────────────────────────────────────────

/** Intent → natural-language response (French, default Wolf Engine persona). */
const _INTENT_RESPONSES = {
  create_event: a => `Parfait, je crée l'événement "${a.subject}" pour ${a.date} à ${a.time}.`,
  cancel_event: a => `D'accord, j'annule l'événement "${a.subject}".`,
  update_event: a => `Je mets à jour l'événement "${a.subject}".`,
  list_events: () => 'Voici vos événements à venir.',
  unknown: () => "Je n'ai pas compris votre demande. Pouvez-vous reformuler ?",
};

/**
 * Build the text the TTS engine will speak from the NLU analysis.
 * @param {object} analysis  { intent, subject, date, time, ... }
 * @returns {string}
 */
function _composeResponse(analysis) {
  const fn = _INTENT_RESPONSES[analysis?.intent] ?? _INTENT_RESPONSES.unknown;
  return fn(analysis ?? {});
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a `process` function bound to specific client implementations.
 *
 * Exported for testing — production code should use the default `process` export.
 *
 * @param {object} [deps]
 * @param {function} [deps.transcribeWav]  whisper.client transcribeWav
 * @param {function} [deps.claudeAnalyze]  claude.client analyze
 * @param {function} [deps.synthesize]     tts.client synthesize
 * @param {function} [deps.now]            () => number  (clock injection for tests)
 * @returns {{ process: function }}
 */
export function _makeAgent(deps = {}) {
  let transcribeWav, claudeAnalyze, synthesize;

  // Lazy-resolved defaults (dynamic import avoids circular deps at module load time)
  async function _resolve() {
    if (!transcribeWav) {
      transcribeWav = deps.transcribeWav ?? (await import('./whisper.client.js')).transcribeWav;
    }
    if (!claudeAnalyze) {
      claudeAnalyze = deps.claudeAnalyze ?? (await import('./claude.client.js')).analyze;
    }
    if (!synthesize) {
      synthesize = deps.synthesize ?? (await import('./tts.client.js')).synthesize;
    }
  }

  const _now = deps.now ?? (() => Date.now());

  /**
   * Run the full 4-stage ML pipeline.
   *
   * @param {Buffer|null} [wavBuffer]  Raw WAV audio. Pass null / omit for text-only input.
   * @param {object}      [opts]
   * @param {string}      [opts.requestId]   Auto-generated UUID if not provided.
   * @param {string}      [opts.text]        Pre-transcribed text (skips Whisper stage).
   * @param {string}      [opts.locale]      BCP-47 locale for TTS (default: 'fr-FR').
   * @param {number}      [opts.timeoutMs]   Per-stage timeout forwarded to each client.
   *
   * @returns {Promise<AgentSuccess|AgentFailure>}
   *
   * @typedef {object} AgentSuccess
   * @property {true}   ok
   * @property {string} requestId
   * @property {string} transcription
   * @property {object} analysis        NLU output from Claude
   * @property {object} audio           { buffer, ext, mimeType }
   * @property {string} responseText    Text fed to TTS
   * @property {number} latency         Total pipeline latency in ms
   *
   * @typedef {object} AgentFailure
   * @property {false}  ok
   * @property {string} stage           'whisper' | 'claude' | 'tts'
   * @property {string} error           err.message
   * @property {string} requestId
   */
  async function process(wavBuffer = null, opts = {}) {
    const requestId = opts.requestId ?? randomUUID();
    const start = _now();

    await _resolve();

    log.info({ requestId }, 'Agent pipeline start');

    // ── Stage 1: Whisper ────────────────────────────────────────────────────
    let transcription = opts.text ?? null;

    if (transcription === null) {
      try {
        transcription = await transcribeWav(wavBuffer, { requestId, timeoutMs: opts.timeoutMs });
      } catch (err) {
        const reason = _failureReason(err);
        recordAgentStageFailure('whisper', reason);
        recordAgentRequest('error');
        recordAgentLatency(_now() - start);
        log.warn({ requestId, err: err.message }, 'Agent: Whisper stage failed');
        return { ok: false, stage: 'whisper', error: err.message, requestId };
      }
    }

    // ── Stage 2: Claude NLU ─────────────────────────────────────────────────
    let analysis;
    try {
      analysis = await claudeAnalyze(transcription, { requestId, timeoutMs: opts.timeoutMs });
    } catch (err) {
      const reason = _failureReason(err);
      recordAgentStageFailure('claude', reason);
      recordAgentRequest('error');
      recordAgentLatency(_now() - start);
      log.warn({ requestId, err: err.message }, 'Agent: Claude stage failed');
      return { ok: false, stage: 'claude', error: err.message, requestId };
    }

    // ── Stage 3: TTS ────────────────────────────────────────────────────────
    const responseText = _composeResponse(analysis);
    let audio;
    try {
      audio = await synthesize(responseText, {
        requestId,
        locale: opts.locale ?? 'fr-FR',
        timeoutMs: opts.timeoutMs,
      });
    } catch (err) {
      const reason = _failureReason(err);
      recordAgentStageFailure('tts', reason);
      recordAgentRequest('error');
      recordAgentLatency(_now() - start);
      log.warn({ requestId, err: err.message }, 'Agent: TTS stage failed');
      return { ok: false, stage: 'tts', error: err.message, requestId };
    }

    // ── Success ─────────────────────────────────────────────────────────────
    const latency = _now() - start;
    recordPipelineSuccess();
    recordAgentRequest('success');
    recordAgentLatency(latency);
    log.info({ requestId, latency, intent: analysis?.intent }, 'Agent pipeline success');

    return {
      ok: true,
      requestId,
      transcription,
      analysis,
      audio,
      responseText,
      latency,
    };
  }

  return { process };
}

// ── Default production instance ───────────────────────────────────────────────

export const { process } = _makeAgent();
