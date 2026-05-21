// @ts-nocheck
// src/features/nlu/strategies/rule-based.strategy.js — Regex-based NLU fallback strategy.
import { NluStrategy } from './base.strategy.js';

export class RuleBasedStrategy extends NluStrategy {
  async analyze(text, _options = {}) {
    const lower = text.toLowerCase();
    let intent = 'unknown';
    if (/cr(ée|e|e un rendez|rendez-vous|rdv|ajoute)/.test(lower)) intent = 'create_event';
    else if (/annul|supprim|effac|retir/.test(lower)) intent = 'cancel_event';
    else if (/modif|change|d(é|e)place|replan|repouss/.test(lower)) intent = 'update_event';
    else if (/liste|quels|quoi|affich/.test(lower)) intent = 'list_events';

    const matchTime = lower.match(/(\d{1,2})(h|hures?)\s*(\d{0,2})?/);
    const time = matchTime ? `${matchTime[1]}:${matchTime[3] || '00'}` : '';

    const matchDate = lower.match(
      /(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d{1,2})/
    );
    let date = '';
    if (matchDate) {
      const d = matchDate[1];
      if (d === "aujourd'hui") date = new Date().toISOString().slice(0, 10);
      else if (d === 'demain') {
        const dt = new Date();
        dt.setDate(dt.getDate() + 1);
        date = dt.toISOString().slice(0, 10);
      } else if (/\d{1,2}\/\d{1,2}/.test(d)) {
        const [day, month] = d.split('/');
        const year = new Date().getFullYear();
        date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
          .toISOString()
          .slice(0, 10);
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
}
