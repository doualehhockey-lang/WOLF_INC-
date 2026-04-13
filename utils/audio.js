import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// μ-law -> PCM16 conversion table (standard ITU-T G.711)
const MULAW_DECODE_TABLE = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let sample = ~i;
    let sign = sample & 0x80;
    let exponent = (sample >> 4) & 0x07;
    let mantissa = sample & 0x0f;
    sample = ((mantissa << 3) + 0x84) << exponent;
    sample = sign ? (0x84 - sample) : (sample - 0x84);
    table[i] = sample;
  }
  return table;
})();

export function mulawToWav(muLawBuffer) {
  if (!Buffer.isBuffer(muLawBuffer)) throw new Error('mulawToWav: expected Buffer');

  const pcm = Buffer.alloc(muLawBuffer.length * 2);
  for (let i = 0; i < muLawBuffer.length; i++) {
    const sample = MULAW_DECODE_TABLE[muLawBuffer[i] & 0xff];
    pcm.writeInt16LE(sample, i * 2);
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
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm16Buffer.copy(buffer, 44);

  return buffer;
}

export async function downloadTwilioMedia(url, accountSid, authToken) {
  if (!url) throw new Error('downloadTwilioMedia: url missing');

  const headers = {};
  if (accountSid && authToken) {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Twilio media download failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export async function saveAudio(buffer, dir, ext = 'wav') {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  const filename = `tts_${Date.now()}.${ext}`;
  const filepath = `${dir.replace(/\\$/, '')}/${filename}`;
  await writeFile(filepath, buffer);
  return { filepath, filename };
}
