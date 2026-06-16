// @ts-nocheck
// src/features/tts/providers/mock.js — Silent WAV generator for tests and dev.
import { childLogger } from '../../../core/logger.js';

const log = childLogger('mock.tts');

export function synthesizeMock(text) {
  log.debug({ text: text.slice(0, 60) }, 'TTS mock synthesis');
  const sr = 8000;
  const dur = 1;
  const data = Buffer.alloc(sr * 2 * dur, 0);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Promise.resolve(Buffer.concat([h, data]));
}
