// @ts-nocheck
// src/features/voice/twiml.builder.js — Pure TwiML string builders.
// No side-effects — each function returns a valid TwiML XML string.
// Import these instead of hand-rolling XML in controllers.

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
  const errorMsg = "Une erreur est survenue. Veuillez réessayer.";
  if (gatherUrl) return twimlSayThenGather(errorMsg, gatherUrl, { locale });
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="${_esc(locale)}">${_esc(errorMsg)}</Say>
  <Hangup/>
</Response>`;
}

// ── Private ───────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
