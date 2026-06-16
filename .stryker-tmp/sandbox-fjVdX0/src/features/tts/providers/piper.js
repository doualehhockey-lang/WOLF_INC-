// @ts-nocheck
// src/features/tts/providers/piper.js — Local Piper TTS synthesis.
// Writes text to a temp file, runs the piper binary, reads the WAV output.
// Requires PIPER_BINARY and PIPER_MODEL_PATH to be configured.

import { execFile }              from 'child_process';
import { promisify }             from 'util';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { resolve }               from 'path';
import { randomUUID }            from 'crypto';
import { config }                from '../../../core/config.js';
import { TtsError }              from '../../../core/errors.js';

const execFileAsync = promisify(execFile);

/**
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function synthesizePiper(text) {
  const modelPath = config.PIPER_MODEL_PATH;
  const piperBin  = config.PIPER_BINARY;

  if (!modelPath) throw new TtsError('PIPER_MODEL_PATH is not configured');

  const tmpDir  = resolve('./tmp/tts');
  await mkdir(tmpDir, { recursive: true });

  const outFile = resolve(tmpDir, `${randomUUID()}.wav`);
  const inFile  = resolve(tmpDir, `${randomUUID()}.txt`);
  await writeFile(inFile, text.slice(0, 1_000), 'utf8');

  try {
    await execFileAsync(
      piperBin,
      ['--model', modelPath, '--output_file', outFile, '--input_file', inFile],
      { timeout: 30_000 }
    );
    return await readFile(outFile);
  } catch (err) {
    throw new TtsError(`Piper synthesis failed: ${err.message}`);
  } finally {
    unlink(outFile).catch(() => {});
    unlink(inFile).catch(() => {});
  }
}
