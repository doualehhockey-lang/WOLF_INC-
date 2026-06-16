// src/features/tts/providers/azure.js — Azure Cognitive Services TTS.
// Produces MP3 via SSML + token-auth flow.
// Requires AZURE_TTS_KEY.

import { config } from '../../../core/config.js';
import { TtsError } from '../../../core/errors.js';
import { apiFetch } from '../../../infra/http/httpClient.js';

function _escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} text
 * @param {string} [locale]
 * @returns {Promise<Buffer>}
 */
export async function synthesizeAzure(text, locale = 'fr-FR') {
  const { AZURE_TTS_KEY: key, AZURE_TTS_REGION: region, AZURE_TTS_VOICE: voice } = config;

  if (!key) throw new TtsError('AZURE_TTS_KEY is not configured');

  // Step 1 — get bearer token
  const tokenRes = await apiFetch(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key },
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!tokenRes.ok) throw new TtsError(`Azure token request failed: ${tokenRes.status}`);
  const token = await tokenRes.text();

  // Step 2 — synthesize
  const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${voice}'><prosody rate='0%'>${_escXml(text)}</prosody></voice></speak>`;
  const ttsRes = await apiFetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
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
  if (!ttsRes.ok) throw new TtsError(`Azure TTS synthesis failed: ${ttsRes.status}`);

  return Buffer.from(await ttsRes.arrayBuffer());
}
