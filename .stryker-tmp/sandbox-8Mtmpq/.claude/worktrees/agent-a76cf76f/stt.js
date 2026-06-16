// @ts-nocheck
// src/services/stt.js — v2
// Adaptateur STT : TERMINATOR v7 (DSP audio) + Whisper (transcription).
//
// Architecture réelle :
//   Buffer audio (mulaw/wav)
//     → TERMINATOR v7  : décode mulaw → PCM16 propre à 16kHz
//     → Whisper        : transcrit le PCM16 → texte
//
// TERMINATOR = processeur DSP (bruit, resampling, µ-law)
// Whisper    = moteur de reconnaissance vocale
// Les deux se complètent — ni l'un ni l'autre ne suffit seul.

'use strict';

import { config }        from './env.js';
import { mulawToWav, pcm16ToWav } from './utils/audio.js';
import { transcribeWav } from './whisper.js';

// ═══════════════════════════════════════════════════════════
// TERMINATOR v7 — Chargement dynamique
// Chemin configuré dans .env via STT_TERMINATOR_PATH
// ═══════════════════════════════════════════════════════════

let _terminatorModule = null;

/**
 * Tente de charger TERMINATOR v7.
 * Si absent, retourne null (fallback sur conversion audio basique).
 */
async function loadTerminator() {
  if (_terminatorModule !== null) return _terminatorModule; // cache

  const candidates = [
    config.stt.terminatorPath,                       // chemin configuré en .env
    './terminator/audioProcessor.js',                // dossier local classique
    '../terminator/audioProcessor.js',
    '../../terminator/audioProcessor.js',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      const Cls = mod.default ?? mod.AudioProcessor;
      if (typeof Cls === 'function') {
        _terminatorModule = Cls;
        console.log(`[STT] ✅ TERMINATOR v7 chargé : ${candidate}`);
        return _terminatorModule;
      }
    } catch { /* essaie le suivant */ }
  }

  console.warn('[STT] ⚠️  TERMINATOR v7 non trouvé — conversion audio basique utilisée');
  _terminatorModule = false; // false = "cherché, non trouvé"
  return null;
}

// ═══════════════════════════════════════════════════════════
// ÉTAPE 1 — Préparation audio avec TERMINATOR v7
// ═══════════════════════════════════════════════════════════

/**
 * Prépare un buffer audio via TERMINATOR v7 :
 *   - Décode µ-law → PCM16
 *   - Resampling 8kHz → 16kHz (polyphase sinc)
 *   - Filtrage bruit, DC remove, anti-ringing
 *   - Retourne un WAV propre à 16kHz, prêt pour Whisper
 *
 * @param {Buffer} rawBuf   - mulaw ou WAV brut depuis Twilio
 * @param {'mulaw'|'wav'}  format
 * @returns {Promise<Buffer>} WAV PCM16 16kHz
 */
async function prepareAudioWithTerminator(rawBuf, format) {
  const AudioProcessor = await loadTerminator();

  if (!AudioProcessor) {
    // Fallback : conversion basique sans TERMINATOR
    return format === 'mulaw' ? mulawToWav(rawBuf) : rawBuf;
  }

  // TERMINATOR traite des paquets mulaw base64 (format Twilio MediaStream)
  // Pour un enregistrement complet, on le découpe en paquets de 160 bytes (20ms @ 8kHz)
  // et on les traite en séquence pour bénéficier du filtrage inter-paquets.

  const muLawBuf = format === 'mulaw'
    ? rawBuf
    : _wavToMulaw(rawBuf); // si déjà WAV, on extrait le PCM

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    // Profile optimisé pour Twilio + Whisper
    const processor = new AudioProcessor('twilio-realtime', {
      resamplerMode:    'high-quality',  // Meilleure qualité pour Whisper
      decodeMode:       'tolerant',      // Reconstruit les bytes corrompus
      dropSilence:      false,           // Garde tout pour la transcription
      flushIntervalMs:  0,               // Pas de flush automatique
      onChunk: (pcm16kBuf) => {
        chunks.push(Buffer.from(pcm16kBuf));
        totalBytes += pcm16kBuf.length;
      },
    });

    // Traite par paquets de 160 bytes (20ms Twilio standard)
    const PACKET_SIZE = 160;
    let processed = 0;

    for (let offset = 0; offset < muLawBuf.length; offset += PACKET_SIZE) {
      const packet = muLawBuf.slice(offset, Math.min(offset + PACKET_SIZE, muLawBuf.length));
      const b64    = packet.toString('base64');
      const result = processor.process(b64);
      if (!result.ok && result.reason !== 'heartbeat' && result.reason !== 'silence') {
        console.warn(`[STT] TERMINATOR packet warning: ${result.reason}`);
      }
      processed++;
    }

    // Flush final pour récupérer les derniers samples
    processor.flush();

    if (!chunks.length || totalBytes === 0) {
      // TERMINATOR n'a rien produit → fallback conversion basique
      console.warn('[STT] TERMINATOR: aucun chunk produit, fallback conversion basique');
      return resolve(format === 'mulaw' ? mulawToWav(rawBuf) : rawBuf);
    }

    // Assemble les chunks PCM16 16kHz en WAV
    const pcm16 = Buffer.concat(chunks);
    const wav   = pcm16ToWav(pcm16, 16000);

    console.log(`[STT] TERMINATOR: ${processed} paquets → ${(totalBytes / 2 / 16000).toFixed(2)}s audio @ 16kHz`);
    resolve(wav);
  });
}

/**
 * Extrait le PCM brut d'un WAV Twilio (8kHz mulaw PCM8 → buffer raw)
 * Si le WAV est déjà PCM16, on le retourne tel quel.
 * Utilisé uniquement si TERMINATOR est disponible pour faire le resampling.
 */
function _wavToMulaw(wavBuf) {
  // Si le buffer commence par RIFF et a un header WAV valide
  if (wavBuf.slice(0, 4).toString() === 'RIFF') {
    // Extrait le PCM brut (skip les 44 bytes de header)
    return wavBuf.slice(44);
  }
  return wavBuf;
}

// ═══════════════════════════════════════════════════════════
// API PUBLIQUE
// ═══════════════════════════════════════════════════════════

/**
 * Transcrit un buffer audio en texte.
 *
 * Pipeline :
 *   rawBuf → TERMINATOR v7 (DSP) → WAV 16kHz propre → Whisper → texte
 *
 * @param {Buffer}          audioBuffer
 * @param {'mulaw'|'wav'}   format       - format du buffer entrant
 * @returns {Promise<string>}
 */
export async function transcribe(audioBuffer, format = 'wav') {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new Error('[STT] Buffer audio vide ou invalide');
  }

  const start = Date.now();

  // ── Étape 1 : Préparation audio (TERMINATOR v7 si disponible) ─────
  let wavBuf;
  try {
    wavBuf = await prepareAudioWithTerminator(audioBuffer, format);
    console.log(`[STT] Audio préparé: ${wavBuf.length} bytes WAV en ${Date.now() - start}ms`);
  } catch (err) {
    console.error('[STT] Erreur préparation audio:', err.message);
    // Fallback : conversion directe sans TERMINATOR
    wavBuf = format === 'mulaw' ? mulawToWav(audioBuffer) : audioBuffer;
  }

  // ── Étape 2 : Transcription Whisper ───────────────────────────────
  const t1 = Date.now();
  const text = await transcribeWav(wavBuf);
  console.log(`[STT] Transcription: "${text}" en ${Date.now() - t1}ms (total: ${Date.now() - start}ms)`);

  return text;
}
