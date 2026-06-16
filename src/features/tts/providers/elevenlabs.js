// src/features/tts/providers/elevenlabs.js — ElevenLabs cloud TTS.
// Produces MP3 via the multilingual v2 model.
// Requires ELEVENLABS_API_KEY.
<<<<<<< HEAD
//
// Voice settings tuned for a warm, natural-sounding French receptionist:
//   stability: 0.65 — consistent but not monotone (allows natural inflection)
//   similarity_boost: 0.80 — high fidelity to the chosen voice clone
//   style: 0.15 — subtle expressiveness (professional warmth, not theatrical)
//   use_speaker_boost: true — enhanced clarity for phone-quality audio

import { config } from '../../../core/config.js';
=======

import { config }   from '../../../core/config.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import { TtsError } from '../../../core/errors.js';
import { apiFetch } from '../../../infra/http/httpClient.js';

/**
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function synthesizeElevenLabs(text) {
  const { ELEVENLABS_API_KEY: apiKey, ELEVENLABS_VOICE_ID: voiceId } = config;

  if (!apiKey) throw new TtsError('ELEVENLABS_API_KEY is not configured');

<<<<<<< HEAD
  const res = await apiFetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.65,
        similarity_boost: 0.8,
        style: 0.15,
        use_speaker_boost: true,
      },
=======
  const res = await apiFetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method:  'POST',
    headers: {
      'xi-api-key':    apiKey,
      'Content-Type':  'application/json',
      'Accept':        'audio/mpeg',
    },
    body:   JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new TtsError(`ElevenLabs ${res.status}: ${detail}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
