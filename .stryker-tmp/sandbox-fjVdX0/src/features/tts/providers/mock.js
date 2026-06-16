// @ts-nocheck
// src/features/tts/providers/mock.js — Silent WAV buffer for dev/test.
// Returns a valid 1-second WAV at 8 kHz so audio players don't choke.

import { childLogger } from '../../../core/logger.js';

const log = childLogger('tts:mock');

/**
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function synthesizeMock(text) {
  log.debug({ text: text.slice(0, 60) }, 'Mock TTS synthesis');

  const sampleRate = 8_000;
  const duration   = 1; // seconds
  const data       = Buffer.alloc(sampleRate * 2 * duration, 0);
  const header     = Buffer.alloc(44);

  header.write('RIFF', 0);                       header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);                        header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);                   header.writeUInt16LE(1, 20);  // PCM
  header.writeUInt16LE(1, 22);                    header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);       header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);                   header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}
