// src/services/dateparser.js — Lightweight French date/time resolver.
// Converts raw strings like "demain", "lundi", "14h30" to ISO format.
// No external dependencies — pure string + Date logic.

const WEEKDAYS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };

function _nextWeekday(name, ref) {
  const target = WEEKDAYS[name.toLowerCase()];
  if (target === undefined) return null;
  const diff = (target - ref.getDay() + 7) % 7 || 7;
  const d = new Date(ref);
  d.setDate(ref.getDate() + diff);
  return d;
}

/**
 * Resolve raw date/time strings to ISO parts.
 * @param {string} rawDate
 * @param {string} rawTime
 * @param {Date}   referenceDate
 * @returns {{ date:string|null, time:string|null, iso:string|null, hasDate:boolean, hasTime:boolean }}
 */
export function resolve(rawDate, rawTime, referenceDate = new Date()) {
  let date = null;
  let time = null;

  // ── Date ──────────────────────────────────────────────────────────────────
  const ds = String(rawDate ?? '')
    .trim()
    .toLowerCase();
  if (ds) {
    if (ds === "aujourd'hui" || ds === 'aujourd hui') {
      date = referenceDate.toISOString().slice(0, 10);
    } else if (ds === 'demain') {
      const d = new Date(referenceDate);
      d.setDate(d.getDate() + 1);
      date = d.toISOString().slice(0, 10);
    } else if (WEEKDAYS[ds] !== undefined) {
      const d = _nextWeekday(ds, referenceDate);
      if (d) date = d.toISOString().slice(0, 10);
    } else if (/^\d{1,2}\/\d{1,2}$/.test(ds)) {
      const [day, month] = ds.split('/').map(Number);
      const d = new Date(referenceDate.getFullYear(), month - 1, day);
      if (!isNaN(d)) date = d.toISOString().slice(0, 10);
    } else {
      const d = new Date(ds);
      if (!isNaN(d)) date = d.toISOString().slice(0, 10);
    }
  }

  // ── Time ──────────────────────────────────────────────────────────────────
  const ts = String(rawTime ?? '')
    .trim()
    .toLowerCase();
  if (ts) {
    const m = ts.match(/^(\d{1,2})(?:h|:)?(\d{0,2})$/);
    if (m) {
      const hh = String(Math.min(23, parseInt(m[1], 10))).padStart(2, '0');
      const mm = String(Math.min(59, parseInt(m[2] || '0', 10))).padStart(2, '0');
      time = `${hh}:${mm}`;
    }
  }

  const iso = date && time ? `${date}T${time}:00` : null;

  return { date, time, iso, hasDate: !!date, hasTime: !!time };
}
