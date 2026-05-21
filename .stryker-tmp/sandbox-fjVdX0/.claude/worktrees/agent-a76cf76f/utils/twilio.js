// @ts-nocheck
export const TWIML_HEADERS = {
  'Content-Type': 'application/xml',
};

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function twimlSay(text) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice=\"alice\" language=\"fr-FR\">${escapeXml(text)}</Say>\n</Response>`;
}

export function twimlPlay(url) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Play>${escapeXml(url)}</Play>\n</Response>`;
}

// Play audio then immediately listen for the next user utterance (keeps conversation alive)
export function twimlPlayThenGather(audioUrl, gatherUrl, { timeout = 5 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" timeout="${timeout}" action="${escapeXml(gatherUrl)}" method="POST">
    <Play>${escapeXml(audioUrl)}</Play>
  </Gather>
  <Say voice="alice" language="fr-FR">Je n'ai pas entendu votre réponse. Au revoir.</Say>
</Response>`;
}

// Say text then listen for the next user utterance (fallback when TTS fails)
export function twimlSayThenGather(text, gatherUrl, { timeout = 5 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" timeout="${timeout}" action="${escapeXml(gatherUrl)}" method="POST">
    <Say voice="alice" language="fr-FR">${escapeXml(text)}</Say>
  </Gather>
  <Say voice="alice" language="fr-FR">Je n'ai pas entendu votre réponse. Au revoir.</Say>
</Response>`;
}

export function twimlRecord(actionUrl, options = {}) {
  const attrs = [];
  if (options.timeout) attrs.push(`timeout=\"${options.timeout}\"`);
  if (options.maxLength) attrs.push(`maxLength=\"${options.maxLength}\"`);
  if (options.playBeep !== undefined) attrs.push(`playBeep=\"${options.playBeep ? 'true' : 'false'}\"`);
  attrs.push(`action=\"${escapeXml(actionUrl)}\"`);
  attrs.push('method="POST"');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice=\"alice\" language=\"fr-FR\">Veuillez enregistrer votre message après le bip.</Say>\n  <Record ${attrs.join(' ')} />\n</Response>`;
}

export function twimlGather(prompt, actionUrl, options = {}) {
  const attrs = [];
  attrs.push('input="speech"');
  attrs.push('language="fr-FR"');
  if (options.timeout) attrs.push(`timeout=\"${options.timeout}\"`);
  if (options.speechTimeout) attrs.push(`speechTimeout=\"${options.speechTimeout}\"`);
  attrs.push(`action=\"${escapeXml(actionUrl)}\"`);
  attrs.push('method="POST"');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Gather ${attrs.join(' ')}>
    <Say voice=\"alice\" language=\"fr-FR\">${escapeXml(prompt)}</Say>
  </Gather>\n  <Say>Nous n\'avons pas reçu votre réponse.</Say>\n</Response>`;
}

// gatherUrl is optional — if provided, error loops back to gather instead of hanging up
export function twimlError(gatherUrl = null) {
  if (gatherUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="fr-FR" speechTimeout="auto" timeout="5" action="${gatherUrl}" method="POST">
    <Say voice="alice" language="fr-FR">Désolé, une erreur est survenue. Réessayez votre demande.</Say>
  </Gather>
  <Say voice="alice" language="fr-FR">Au revoir.</Say>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="alice" language="fr-FR">Désolé, une erreur est survenue. Veuillez réessayer.</Say>\n</Response>`;
}
