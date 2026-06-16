// src/features/voice/twiml.builder.js — Pure TwiML string builders.
// No side-effects — each function returns a valid TwiML XML string.
// Import these instead of hand-rolling XML in controllers.
// Default locale matches config.VOICE_DEFAULT_LOCALE default ('fr-FR').
// Callers that need the configured locale should pass config.VOICE_DEFAULT_LOCALE explicitly.

export const TWIML_HEADERS = {
  'Content-Type': 'text/xml; charset=utf-8',
  'Cache-Control': 'no-cache, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Play an audio file then open a <Gather> for more speech.
 * @param {string} audioUrl
 * @param {string} gatherUrl
 * @param {object} [opts]
 */
export function twimlPlayThenGather(audioUrl, gatherUrl, opts = {}) {
  const { locale = 'fr-FR', timeout = 5, speechTimeout = 'auto' } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${_esc(gatherUrl)}" method="POST"
          language="${_esc(locale)}" timeout="${timeout}" speechTimeout="${speechTimeout}">
    <Play>${_esc(audioUrl)}</Play>
  </Gather>
</Response>`;
}

/**
 * Say text via Twilio TTS then open a <Gather>.
 * @param {string} text
 * @param {string} gatherUrl
 * @param {object} [opts]
 */
export function twimlSayThenGather(text, gatherUrl, opts = {}) {
  const { locale = 'fr-FR', timeout = 5, speechTimeout = 'auto' } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${_esc(gatherUrl)}" method="POST"
          language="${_esc(locale)}" timeout="${timeout}" speechTimeout="${speechTimeout}">
    <Say language="${_esc(locale)}">${_esc(text)}</Say>
  </Gather>
</Response>`;
}

/**
 * Simple <Gather> with a prompt (no audio).
 */
export function twimlGather(prompt, gatherUrl, opts = {}) {
  const { locale = 'fr-FR', timeout = 5, speechTimeout = 'auto' } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${_esc(gatherUrl)}" method="POST"
          language="${_esc(locale)}" timeout="${timeout}" speechTimeout="${speechTimeout}">
    <Say language="${_esc(locale)}">${_esc(prompt)}</Say>
  </Gather>
</Response>`;
}

/**
 * Error response — says a generic message and optionally loops back to gather.
 */
export function twimlError(gatherUrl = null, locale = 'fr-FR') {
  const errorMsg = 'Excusez-moi, un petit problème est survenu. Pourriez-vous réessayer ?';
  if (gatherUrl) return twimlSayThenGather(errorMsg, gatherUrl, { locale });
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="${_esc(locale)}">${_esc(errorMsg)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Play a filler message ("Un instant...") then redirect to a processing URL.
 * This eliminates dead silence: the caller hears a natural acknowledgment
 * while the pipeline processes their request in the background.
 */
export function twimlFillerThenRedirect(fillerAudioUrl, fillerText, redirectUrl, locale = 'fr-FR') {
  const filler = fillerAudioUrl
    ? `<Play>${_esc(fillerAudioUrl)}</Play>`
    : `<Say language="${_esc(locale)}">${_esc(fillerText)}</Say>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${filler}
  <Redirect method="POST">${_esc(redirectUrl)}</Redirect>
</Response>`;
}

// ── Private ───────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
