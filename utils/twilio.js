export const TWIML_HEADERS = {
  'Content-Type': 'application/xml',
};

const GenericResponses = {
  'fr-FR': {
    noResponse: "Je n'ai pas entendu votre réponse. Au revoir.",
    recordPrompt: 'Veuillez enregistrer votre message après le bip.',
    noInput: "Nous n'avons pas reçu votre réponse.",
    errorRetry: 'Désolé, une erreur est survenue. Réessayez votre demande.',
    errorGeneric: 'Désolé, une erreur est survenue. Veuillez réessayer.',
  },
  'en-US': {
    noResponse: "I didn't hear your answer. Goodbye.",
    recordPrompt: 'Please record your message after the beep.',
    noInput: "We didn't receive your response.",
    errorRetry: 'Sorry, an error occurred. Please try again.',
    errorGeneric: 'Sorry, an error occurred. Please try again.',
  },
  'es-ES': {
    noResponse: 'No escuché tu respuesta. Adiós.',
    recordPrompt: 'Por favor, graba tu mensaje después del bip.',
    noInput: 'No recibimos tu respuesta.',
    errorRetry: 'Lo siento, ocurrió un error. Por favor inténtalo de nuevo.',
    errorGeneric: 'Lo siento, ocurrió un error. Por favor inténtalo de nuevo.',
  },
  'ar-SA': {
    noResponse: 'لم أسمع إجابتك. إلى اللقاء.',
    recordPrompt: 'يرجى تسجيل رسالتك بعد الصفير.',
    noInput: 'لم نتلقَ ردك.',
    errorRetry: 'عذراً، حدث خطأ. الرجاء المحاولة مرة أخرى.',
    errorGeneric: 'عذراً، حدث خطأ. الرجاء المحاولة مرة أخرى.',
  },
};

function ensureLocale(locale) {
  return locale && typeof locale === 'string' ? locale : 'fr-FR';
}

function localize(key, locale) {
  const safeLocale = ensureLocale(locale);
  return GenericResponses[safeLocale]?.[key] || GenericResponses['fr-FR'][key];
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function twimlSay(text, locale = 'fr-FR') {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="alice" language="${ensureLocale(locale)}">${escapeXml(text)}</Say>\n</Response>`;
}

export function twimlPlay(url) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Play>${escapeXml(url)}</Play>\n</Response>`;
}

// Play audio then immediately listen for the next user utterance (keeps conversation alive)
export function twimlPlayThenGather(audioUrl, gatherUrl, { timeout = 5, locale = 'fr-FR' } = {}) {
  const lang = ensureLocale(locale);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="${lang}" speechTimeout="auto" timeout="${timeout}" action="${escapeXml(gatherUrl)}" method="POST">
    <Play>${escapeXml(audioUrl)}</Play>
  </Gather>
  <Say voice="alice" language="${lang}">${escapeXml(localize('noResponse', lang))}</Say>
</Response>`;
}

// Say text then listen for the next user utterance (fallback when TTS fails)
export function twimlSayThenGather(text, gatherUrl, { timeout = 5, locale = 'fr-FR' } = {}) {
  const lang = ensureLocale(locale);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="${lang}" speechTimeout="auto" timeout="${timeout}" action="${escapeXml(gatherUrl)}" method="POST">
    <Say voice="alice" language="${lang}">${escapeXml(text)}</Say>
  </Gather>
  <Say voice="alice" language="${lang}">${escapeXml(localize('noResponse', lang))}</Say>
</Response>`;
}

export function twimlRecord(actionUrl, options = {}) {
  const lang = ensureLocale(options.locale);
  const attrs = [];
  if (options.timeout) attrs.push(`timeout=\"${options.timeout}\"`);
  if (options.maxLength) attrs.push(`maxLength=\"${options.maxLength}\"`);
  if (options.playBeep !== undefined)
    attrs.push(`playBeep=\"${options.playBeep ? 'true' : 'false'}\"`);
  attrs.push(`action=\"${escapeXml(actionUrl)}\"`);
  attrs.push('method="POST"');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="alice" language="${lang}">${escapeXml(localize('recordPrompt', lang))}</Say>\n  <Record ${attrs.join(' ')} />\n</Response>`;
}

export function twimlGather(prompt, actionUrl, options = {}) {
  const lang = ensureLocale(options.locale);
  const attrs = [];
  attrs.push('input="speech"');
  attrs.push(`language="${lang}"`);
  if (options.timeout) attrs.push(`timeout=\"${options.timeout}\"`);
  if (options.speechTimeout) attrs.push(`speechTimeout=\"${options.speechTimeout}\"`);
  attrs.push(`action=\"${escapeXml(actionUrl)}\"`);
  attrs.push('method="POST"');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Gather ${attrs.join(' ')}>
    <Say voice="alice" language="${lang}">${escapeXml(prompt)}</Say>
  </Gather>\n  <Say voice="alice" language="${lang}">${escapeXml(localize('noInput', lang))}</Say>\n</Response>`;
}

// gatherUrl is optional — if provided, error loops back to gather instead of hanging up
export function twimlError(gatherUrl = null, locale = 'fr-FR') {
  const lang = ensureLocale(locale);
  if (gatherUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="${lang}" speechTimeout="auto" timeout="5" action="${gatherUrl}" method="POST">
    <Say voice="alice" language="${lang}">${escapeXml(localize('errorRetry', lang))}</Say>
  </Gather>
  <Say voice="alice" language="${lang}">${escapeXml(localize('errorGeneric', lang))}</Say>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="alice" language="${lang}">${escapeXml(localize('errorGeneric', lang))}</Say>\n</Response>`;
}
