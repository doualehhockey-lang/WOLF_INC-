// @ts-nocheck
// src/features/tts/providers/elevenlabs.js — ElevenLabs TTS provider with circuit breaker.
import { config } from '../../../core/config.js';
import { childLogger } from '../../../core/logger.js';

const log = childLogger('elevenlabs');

const CIRCUIT = { failures: 0, openUntil: 0, THRESHOLD: 5, RECOVERY_MS: 30_000 };

function _isOpen() {
  return CIRCUIT.failures >= CIRCUIT.THRESHOLD && Date.now() < CIRCUIT.openUntil;
}

function _recordFailure() {
  CIRCUIT.failures++;
  if (CIRCUIT.failures >= CIRCUIT.THRESHOLD) {
    CIRCUIT.openUntil = Date.now() + CIRCUIT.RECOVERY_MS;
    log.warn({ openUntil: new Date(CIRCUIT.openUntil).toISOString() }, 'ElevenLabs circuit breaker OPEN');
  }
}

function _recordSuccess() {
  CIRCUIT.failures = 0;
}

export async function synthesizeElevenLabs(text) {
  if (_isOpen()) throw new Error('ElevenLabs circuit breaker is open');

  const { apiKey, voiceId } = config.tts.elevenlabs;
  if (!apiKey) throw new Error('TTS ElevenLabs: ELEVENLABS_API_KEY manquant');

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      _recordFailure();
      throw new Error(`ElevenLabs ${res.status}: ${err}`);
    }

    _recordSuccess();
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    _recordFailure();
    throw err;
  }
}
