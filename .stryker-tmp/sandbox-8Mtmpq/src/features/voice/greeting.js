// @ts-nocheck
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
 * Call once at server startup.  Failure is non-fatal.
 * @param {Function} saveAudio  — (buffer, dir, ext) => Promise<{filename}>
 */
export async function prewarmGreeting(saveAudio) {
  try {
    const ttsResult = await synthesize(GREETING_TEXT);
    const { filename } = await saveAudio(ttsResult.buffer, resolve(config.AUDIO_DIR), ttsResult.ext);
    _greetingUrl = `${config.BASE_URL}/audio/${filename}`;
    log.info({ url: _greetingUrl }, 'Greeting pre-warmed');
  } catch (err) {
    log.warn({ err: err.message }, 'Greeting pre-warm failed — will use <Say> fallback');
    _greetingUrl = null;
  }
}
