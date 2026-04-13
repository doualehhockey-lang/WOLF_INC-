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
  if (options.timeout) attrs.push(`timeout=\"${options.timeout}\"`);
  attrs.push(`action=\"${escapeXml(actionUrl)}\"`);
  attrs.push('method="POST"');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Gather ${attrs.join(' ')}>
    <Say voice=\"alice\" language=\"fr-FR\">${escapeXml(prompt)}</Say>
  </Gather>\n  <Say>Nous n\'avons pas reçu votre réponse.</Say>\n</Response>`;
}

export function twimlError() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice=\"alice\" language=\"fr-FR\">Désolé, une erreur est survenue. Veuillez réessayer.</Say>\n</Response>`;
}
