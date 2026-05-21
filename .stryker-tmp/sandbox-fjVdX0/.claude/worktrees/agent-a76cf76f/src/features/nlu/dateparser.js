// @ts-nocheck
// src/features/nlu/dateparser.js — Simple date parser for French date/time phrases.
const WEEKDAYS = {
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  dimanche: 0,
};

function dayNameToDate(dayName, reference = new Date()) {
  const target = WEEKDAYS[dayName.toLowerCase()];
  if (target === undefined) return null;

  const current = reference.getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7;

  const d = new Date(reference);
  d.setDate(reference.getDate() + diff);
  return d;
}

export function resolve(rawDate, rawTime, referenceDate = new Date()) {
  let date = '';
  let time = '';

  const dateStr = String(rawDate || '').trim().toLowerCase();
  if (dateStr) {
    if (dateStr === "aujourd'hui") date = referenceDate.toISOString().slice(0, 10);
    else if (dateStr === 'demain') {
      const d = new Date(referenceDate);
      d.setDate(d.getDate() + 1);
      date = d.toISOString().slice(0, 10);
    } else if (WEEKDAYS[dateStr] !== undefined) {
      const d = dayNameToDate(dateStr, referenceDate);
      if (d) date = d.toISOString().slice(0, 10);
    } else if (/^\d{1,2}\/\d{1,2}$/.test(dateStr)) {
      const [day, month] = dateStr.split('/').map(n => parseInt(n, 10));
      const yr = referenceDate.getFullYear();
      const d = new Date(yr, month - 1, day);
      if (!Number.isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
    } else {
      const parsed = new Date(dateStr);
      if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);
    }
  }

  const timeStr = String(rawTime || '').trim().toLowerCase();
  if (timeStr) {
    const m = timeStr.match(/^(\d{1,2})(?:h|:)?(\d{0,2})$/);
    if (m) {
      const hh = String(Math.min(23, parseInt(m[1], 10))).padStart(2, '0');
      const mm = String(Math.min(59, parseInt(m[2] || '0', 10))).padStart(2, '0');
      time = `${hh}:${mm}`;
    }
  }

  if (!date && rawDate) date = rawDate;
  if (!time && rawTime) time = rawTime;

  const iso = date && time ? `${date}T${time}:00Z` : date ? `${date}T00:00:00Z` : null;

  return { date, time, iso, hasDate: Boolean(date), hasTime: Boolean(time) };
}
