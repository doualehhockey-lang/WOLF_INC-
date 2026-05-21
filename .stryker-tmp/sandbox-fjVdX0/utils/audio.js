// @ts-nocheck
import { writeFile, mkdir, readdir, unlink, stat } from 'fs/promises';
import { resolve } from 'path';
import { config } from '../env.js';

const TTS_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

// Auto-cleanup old TTS files every 5 minutes using config.audioDir (not hardcoded)
setInterval(
  async () => {
    try {
      const dir = resolve(config.audioDir);
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
  5 * 60 * 1000
).unref();

// μ-law → PCM16 decode table (ITU-T G.711)
const MULAW_DECODE_TABLE = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let sample = ~i;
    const sign = sample & 0x80;
    const exponent = (sample >> 4) & 0x07;
    const mantissa = sample & 0x0f;
    sample = ((mantissa << 3) + 0x84) << exponent;
    table[i] = sign ? 0x84 - sample : sample - 0x84;
  }
  return table;
})();

export function mulawToWav(muLawBuffer) {
  if (!Buffer.isBuffer(muLawBuffer)) throw new Error('mulawToWav: expected Buffer');
  const pcm = Buffer.alloc(muLawBuffer.length * 2);
  for (let i = 0; i < muLawBuffer.length; i++) {
    pcm.writeInt16LE(MULAW_DECODE_TABLE[muLawBuffer[i] & 0xff], i * 2);
  }
  return pcm16ToWav(pcm, 16000);
}

export function pcm16ToWav(pcm16Buffer, sampleRate = 16000) {
  if (!Buffer.isBuffer(pcm16Buffer)) throw new Error('pcm16ToWav: expected Buffer');
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16Buffer.length;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bytesPerSample * 8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  pcm16Buffer.copy(buf, 44);
  return buf;
}

export async function downloadTwilioMedia(url, accountSid, authToken) {
  if (!url) throw new Error('downloadTwilioMedia: url missing');
  const headers = {};
  if (accountSid && authToken) {
    headers.Authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Twilio media download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function saveAudio(buffer, dir, ext = 'wav') {
  // mkdir with recursive:true is atomic — no existsSync race condition
  await mkdir(dir, { recursive: true });
  const cleanExt = String(ext).replace(/^\./, '');
  const filename = `tts_${Date.now()}.${cleanExt}`;
  const filepath = `${dir.replace(/[/\\]$/, '')}/${filename}`;
  await writeFile(filepath, buffer);
  return { filepath, filename };
}
