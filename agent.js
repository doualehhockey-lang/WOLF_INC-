// agent.js — logique métier avec stockage mémoire in-memory (simplifié)

const eventsStore = new Map(); // Map<callSid, Array<{id, date, time, subject}>>
let idCounter = 1;

export function normalizeIntent(intent) {
  if (!intent) return 'unknown';
  const lower = intent.toLowerCase();
  if (/create|new|ajout|ajouter/.test(lower)) return 'create_event';
  if (/cancel|annul|supprim|delete|supprimer/.test(lower)) return 'cancel_event';
  if (/update|modif|change|déplace|deplace/.test(lower)) return 'update_event';
  if (/list|agenda|lister|choix/.test(lower)) return 'list_events';
  return lower;
}

function getEvents(callSid) {
  if (!eventsStore.has(callSid)) eventsStore.set(callSid, []);
  return eventsStore.get(callSid);
}

export async function dispatch(nluResult, callSid = 'global') {
  const events = getEvents(callSid);
  const { intent, subject, isoDate, isoTime, date, time } = nluResult;

  switch (intent) {
    case 'create_event': {
      if (!isoDate && !date) return { ok: false, message: 'Je n\'ai pas la date pour créer le rendez-vous.' };
      const event = {
        id: idCounter++,
        subject: subject || 'Rendez-vous',
        date: isoDate || date,
        time: isoTime || time || '00:00',
      };
      events.push(event);
      return { ok: true, message: `OK, rendez-vous créé : ${event.subject} le ${event.date} à ${event.time}.` };
    }

    case 'cancel_event': {
      if (events.length === 0) return { ok: true, message: 'Aucun rendez-vous à annuler.' };
      const removed = events.pop();
      return { ok: true, message: `Rendez-vous annulé : ${removed.subject} le ${removed.date} à ${removed.time}.` };
    }

    case 'update_event': {
      if (events.length === 0) return { ok: true, message: 'Aucun rendez-vous à modifier.' };
      const target = events[events.length - 1];
      if (isoDate || date) target.date = isoDate || date;
      if (isoTime || time) target.time = isoTime || time;
      if (subject) target.subject = subject;
      return { ok: true, message: `Rendez-vous mis à jour : ${target.subject} le ${target.date} à ${target.time}.` };
    }

    case 'list_events': {
      if (events.length === 0) return { ok: true, message: 'Vous n\'avez aucun rendez-vous.' };
      const list = events.map(e => `- ${e.subject} le ${e.date} à ${e.time}`).join('\n');
      return { ok: true, message: `Vos rendez-vous :\n${list}` };
    }

    default:
      return { ok: false, message: 'Désolé, je n\'ai pas compris la commande.' };
  }
}
