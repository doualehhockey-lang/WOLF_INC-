// src/services/audio.utils.js — Audio buffer utilities and file persistence.
// μ-law → WAV conversion, PCM16 → WAV wrapping, Twilio media download, saveAudio.
// Auto-purges TTS files older than 10 min to prevent disk fill.

import { writeFile, mkdir, readdir, unlink, stat } from 'fs/promises';
import { config } from '../core/config.js';

const TTS_MAX_AGE_MS = 10 * 60 * 1_000; // 10 min

// Auto-purge old TTS audio files every 5 minutes
<<<<<<< HEAD
setInterval(
  async () => {
    try {
      const dir = config.AUDIO_DIR;
      const files = await readdir(dir).catch(() => []);
      const now = Date.now();
      await Promise.all(
        files.map(async f => {
          const fp = `${dir}/${f}`;
          const s = await stat(fp).catch(() => null);
          if (s && now - s.mtimeMs > TTS_MAX_AGE_MS) await unlink(fp).catch(() => {});
        })
      );
    } catch {
      /* non-blocking */
    }
  },
  5 * 60 * 1_000
).unref();
=======
setInterval(async () => {
  try {
    const dir   = config.AUDIO_DIR;
    const files = await readdir(dir).catch(() => []);
    const now   = Date.now();
    await Promise.all(
      files.map(async f => {
        const fp = `${dir}/${f}`;
        const s  = await stat(fp).catch(() => null);
        if (s && now - s.mtimeMs > TTS_MAX_AGE_MS) await unlink(fp).catch(() => {});
      })
    );
  } catch { /* non-blocking */ }
}, 5 * 60 * 1_000).unref();
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

// ── μ-law decode table (ITU-T G.711) ─────────────────────────────────────────

const MULAW_TABLE = (() => {
  const t = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
<<<<<<< HEAD
    let sample = ~i;
    const sign = sample & 0x80;
    const exp = (sample >> 4) & 0x07;
    const mant = sample & 0x0f;
    sample = ((mant << 3) + 0x84) << exp;
    t[i] = sign ? 0x84 - sample : sample - 0x84;
=======
    let sample   = ~i;
    const sign   = sample & 0x80;
    const exp    = (sample >> 4) & 0x07;
    const mant   = sample & 0x0f;
    sample       = ((mant << 3) + 0x84) << exp;
    t[i]         = sign ? 0x84 - sample : sample - 0x84;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  }
  return t;
})();

export function mulawToWav(buf) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('mulawToWav: expected Buffer');
  const pcm = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) pcm.writeInt16LE(MULAW_TABLE[buf[i] & 0xff], i * 2);
  return pcm16ToWav(pcm, 16_000);
}

export function pcm16ToWav(pcm, sampleRate = 16_000) {
  if (!Buffer.isBuffer(pcm)) throw new TypeError('pcm16ToWav: expected Buffer');
<<<<<<< HEAD
  const channels = 1,
    _bytesPerSample = 2;
  const out = Buffer.alloc(44 + pcm.length);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + pcm.length, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(pcm.length, 40);
  pcm.copy(out, 44);
=======
  const channels = 1, bytesPerSample = 2;
  const out = Buffer.alloc(44 + pcm.length);
  out.write('RIFF', 0);               out.writeUInt32LE(36 + pcm.length, 4);
  out.write('WAVE', 8);               out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);          out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22);    out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28); out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);          out.write('data', 36);
  out.writeUInt32LE(pcm.length, 40);  pcm.copy(out, 44);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return out;
}

export async function downloadTwilioMedia(url, accountSid, authToken) {
  if (!url) throw new Error('downloadTwilioMedia: url required');
  const headers = {};
  if (accountSid && authToken) {
    headers.Authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Twilio media download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Persist a TTS audio buffer to disk.
 * @param {Buffer} buffer
 * @param {string} dir
 * @param {string} [ext]
 * @returns {Promise<{filepath:string, filename:string}>}
 */
export async function saveAudio(buffer, dir, ext = 'wav') {
  await mkdir(dir, { recursive: true });
  const cleanExt = String(ext).replace(/^\./, '');
<<<<<<< HEAD
  const filename = `tts_${Date.now()}.${cleanExt}`;
  const filepath = `${dir.replace(/[/\\]$/, '')}/${filename}`;
=======
  const filename  = `tts_${Date.now()}.${cleanExt}`;
  const filepath  = `${dir.replace(/[/\\]$/, '')}/${filename}`;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  await writeFile(filepath, buffer);
  return { filepath, filename };
}
