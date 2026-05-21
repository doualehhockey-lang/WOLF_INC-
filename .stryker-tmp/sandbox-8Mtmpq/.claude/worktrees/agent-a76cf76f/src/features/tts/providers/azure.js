// @ts-nocheck
// src/features/tts/providers/azure.js — Azure Cognitive Services TTS provider with circuit breaker.
import { config } from '../../../core/config.js';
import { childLogger } from '../../../core/logger.js';

const log = childLogger('azure.tts');

const CIRCUIT = { failures: 0, openUntil: 0, THRESHOLD: 5, RECOVERY_MS: 30_000 };

function _isOpen() {
  return CIRCUIT.failures >= CIRCUIT.THRESHOLD && Date.now() < CIRCUIT.openUntil;
}

function _recordFailure() {
  CIRCUIT.failures++;
  if (CIRCUIT.failures >= CIRCUIT.THRESHOLD) {
    CIRCUIT.openUntil = Date.now() + CIRCUIT.RECOVERY_MS;
    log.warn({ openUntil: new Date(CIRCUIT.openUntil).toISOString() }, 'Azure TTS circuit breaker OPEN');
  }
}

function _recordSuccess() {
  CIRCUIT.failures = 0;
}

function _escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function synthesizeAzure(text, locale = 'fr-FR') {
  if (_isOpen()) throw new Error('Azure TTS circuit breaker is open');

  const { key, region, voice } = config.tts.azure;
  if (!key) throw new Error('TTS Azure: AZURE_TTS_KEY manquant');

  try {
    const tokenRes = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key }, signal: AbortSignal.timeout(10_000) }
    );
    if (!tokenRes.ok) throw new Error(`Azure token ${tokenRes.status}`);
    const token = await tokenRes.text();

    const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${voice}'><prosody rate='0%'>${_escXml(text)}</prosody></voice></speak>`;
    const ttsRes = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'wolf-engine/2.0',
      },
      body: ssml,
      signal: AbortSignal.timeout(20_000),
    });
    if (!ttsRes.ok) throw new Error(`Azure TTS ${ttsRes.status}`);

    _recordSuccess();
    return Buffer.from(await ttsRes.arrayBuffer());
  } catch (err) {
    _recordFailure();
    throw err;
  }
}
