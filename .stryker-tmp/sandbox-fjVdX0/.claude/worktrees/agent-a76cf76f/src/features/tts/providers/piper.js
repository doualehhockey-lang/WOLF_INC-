// @ts-nocheck
// src/features/tts/providers/piper.js — Local Piper TTS synthesis provider.
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { config } from '../../../core/config.js';

const execFileAsync = promisify(execFile);

export async function synthesizePiper(text) {
  const { modelPath, binary: piperBin } = config.tts.piper;
  if (!modelPath) throw new Error('TTS Piper: PIPER_MODEL_PATH manquant dans .env');

  const tmpDir = resolve('./tmp/tts');
  await mkdir(tmpDir, { recursive: true });
  const outFile = resolve(tmpDir, `${randomUUID()}.wav`);
  const inFile = resolve(tmpDir, `${randomUUID()}.txt`);
  await writeFile(inFile, text.slice(0, 1000), 'utf8');

  try {
    await execFileAsync(
      piperBin,
      ['--model', modelPath, '--output_file', outFile, '--input_file', inFile],
      { timeout: 30_000 }
    );
    return await readFile(outFile);
  } finally {
    unlink(outFile).catch(() => {});
    unlink(inFile).catch(() => {});
  }
}
