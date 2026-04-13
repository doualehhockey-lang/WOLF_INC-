import { config } from './env.js';

function escapeJson(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function ruleBasedInterpretation(text) {
  const lower = text.toLowerCase();
  let intent = 'unknown';
  if (/cr(ée|e|e un rendez|rendez-vous|rdv|ajoute)/.test(lower)) intent = 'create_event';
  else if (/annul|supprim|effac|retir/.test(lower)) intent = 'cancel_event';
  else if (/modif|change|d(é|e)place|replan|repouss/.test(lower)) intent = 'update_event';
  else if (/liste|quels|quoi|affich/.test(lower)) intent = 'list_events';

  const matchTime = lower.match(/(\d{1,2})(h|hures?)\s*(\d{0,2})?/);
  const time = matchTime ? `${matchTime[1]}:${matchTime[3] || '00'}` : '';

  const matchDate = lower.match(/(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d{1,2})/);
  let date = '';
  if (matchDate) {
    const d = matchDate[1];
    if (d === 'aujourd\'hui') date = new Date().toISOString().slice(0, 10);
    else if (d === 'demain') {
      const dt = new Date(); dt.setDate(dt.getDate() + 1);
      date = dt.toISOString().slice(0, 10);
    } else if (/\d{1,2}\/\d{1,2}/.test(d)) {
      const [day, month] = d.split('/');
      const year = new Date().getFullYear();
      date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString().slice(0,10);
    }
  }

  const subjectMatch = lower.match(/(?:pour |avec |concernant )(.+?)(?: à | au | en | le |$)/);
  const subject = subjectMatch ? subjectMatch[1].trim() : '';

  return {
    intent,
    subject,
    date,
    time,
    confidence: intent === 'unknown' ? 0.25 : 0.85,
    errors: [],
    strategy: 'rule-based',
  };
}

export async function analyze(text, options = {}) {
  if (!text || !text.trim()) {
    return {
      intent: 'unknown',
      subject: '',
      date: '',
      time: '',
      confidence: 0,
      errors: ['empty-input'],
      strategy: 'none',
    };
  }

  const claudeKey = config.claude.apiKey || process.env.CLAUDE_API_KEY;
  if (!claudeKey) {
    return ruleBasedInterpretation(text);
  }

  try {
    const prompt = `Tu es un assistant qui renvoie un JSON avec les champs : intent, subject, date, time, confidence, errors, strategy.\nTexte: "${escapeJson(text)}"\nRépond uniquement sur une seule ligne JSON.`;
    const body = {
      model: config.claude.model || 'claude-2.1',
      prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
      max_tokens_to_sample: 2500,
      temperature: 0,
      stop_sequences: ['\n\nHuman:'],
    };
    const res = await fetch(config.claude.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[Claude] API error', res.status, errText);
      return ruleBasedInterpretation(text);
    }

    const json = await res.json();
    const raw = json.completion ?? json.output?.[0]?.content?.[0]?.text ?? '';
    const line = String(raw).trim().split('\n')[0];
    const parsed = JSON.parse(line); // peut planter si format inattendu

    return {
      intent: parsed.intent || 'unknown',
      subject: parsed.subject || '',
      date: parsed.date || '',
      time: parsed.time || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      errors: parsed.errors || [],
      strategy: parsed.strategy || 'claude',
    };
  } catch (err) {
    console.warn('[Claude] fallback rule-based:', err.message);
    return ruleBasedInterpretation(text);
  }
}