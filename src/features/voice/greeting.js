<<<<<<< HEAD
// src/features/voice/greeting.js — Pre-warm greeting and filler TTS at startup.
// Caches audio URLs so handlers can use <Play> instead of <Say>,
// giving much better audio quality (ElevenLabs vs Twilio robot voice).

import { resolve } from 'path';
import { childLogger } from '../../core/logger.js';
import { config } from '../../core/config.js';
import { synthesize } from '../tts/tts.service.js';

const log = childLogger('greeting');

export const GREETING_TEXT = config.VOICE_GREETING_TEXT;

// Short filler phrases — played during processing to fill silence gaps.
// Rotated randomly so the caller never hears the same one twice in a row.
const FILLER_PHRASES = [
  'Un instant, je vérifie ça pour vous.',
  'Je regarde ça tout de suite.',
  "Un moment s'il vous plaît.",
];

let _greetingUrl = null;
let _fillerUrls = [];

/** Return the pre-warmed greeting audio URL, or null if not ready. */
export function getGreetingUrl() {
  return _greetingUrl;
}

/** Return a random pre-warmed filler audio URL, or null if not ready. */
export function getFillerUrl() {
  if (!_fillerUrls.length) return null;
  return _fillerUrls[Math.floor(Math.random() * _fillerUrls.length)];
}

/** Return filler text for <Say> fallback when audio is not ready. */
export function getFillerText() {
  return FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];
}

/**
 * Synthesize the greeting + filler clips and save audio files.
=======
// src/features/voice/greeting.js — Pre-warm the greeting TTS at server startup.
// Caches the audio URL so /voice handlers can use <Play> instead of <Say>,
// giving much better audio quality for the first impression.

import { resolve }         from 'path';
import { childLogger }     from '../../core/logger.js';
import { config }          from '../../core/config.js';
import { synthesize }      from '../tts/tts.service.js';

const log = childLogger('greeting');

export const GREETING_TEXT = 'Bonjour, je suis votre assistant Wolf Inc. Comment puis-je vous aider ?';

let _greetingUrl = null;

/** Return the pre-warmed audio URL, or null if not ready. */
export function getGreetingUrl() { return _greetingUrl; }

/**
 * Synthesize the greeting and save the audio file.
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
 * Call once at server startup.  Failure is non-fatal.
 * @param {Function} saveAudio  — (buffer, dir, ext) => Promise<{filename}>
 */
export async function prewarmGreeting(saveAudio) {
<<<<<<< HEAD
  const audioDir = resolve(config.AUDIO_DIR);

  // Pre-warm greeting
  try {
    const ttsResult = await synthesize(GREETING_TEXT);
    const { filename } = await saveAudio(ttsResult.buffer, audioDir, ttsResult.ext);
=======
  try {
    const ttsResult = await synthesize(GREETING_TEXT);
    const { filename } = await saveAudio(ttsResult.buffer, resolve(config.AUDIO_DIR), ttsResult.ext);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    _greetingUrl = `${config.BASE_URL}/audio/${filename}`;
    log.info({ url: _greetingUrl }, 'Greeting pre-warmed');
  } catch (err) {
    log.warn({ err: err.message }, 'Greeting pre-warm failed — will use <Say> fallback');
    _greetingUrl = null;
  }
<<<<<<< HEAD

  // Pre-warm filler clips (best-effort, non-blocking)
  const fillerResults = await Promise.allSettled(
    FILLER_PHRASES.map(async phrase => {
      const ttsResult = await synthesize(phrase);
      const { filename } = await saveAudio(ttsResult.buffer, audioDir, ttsResult.ext);
      return `${config.BASE_URL}/audio/${filename}`;
    })
  );

  _fillerUrls = fillerResults.filter(r => r.status === 'fulfilled').map(r => r.value);

  if (_fillerUrls.length) {
    log.info({ count: _fillerUrls.length }, 'Filler clips pre-warmed');
  } else {
    log.warn('Filler pre-warm failed — will use <Say> fallback');
  }
=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}
