// src/core/businessHours.js — Business hours validation.

import { readTenantSettings } from './tenantSettings.js';

/**
 * Validate if a date/time is within business hours.
 * @param {string} tenantId
 * @param {string} date — YYYY-MM-DD
 * @param {string} time — HH:MM
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateBusinessHours(tenantId, date, time) {
  const settings = readTenantSettings(tenantId);
  const openTime = settings.openTime || '09:00';
  const closeTime = settings.closeTime || '19:00';
  const closedDays = Array.isArray(settings.closedDays) ? settings.closedDays : [0]; // Sunday

  const d = new Date(`${date}T${time || '00:00'}`);
  if (isNaN(d.getTime())) return { valid: false, reason: 'Date invalide' };

  const dayOfWeek = d.getDay();
  if (closedDays.includes(dayOfWeek)) {
    return { valid: false, reason: 'Fermé ce jour-là' };
  }

  if (time && (time < openTime || time >= closeTime)) {
    return { valid: false, reason: `Hors horaires (${openTime}–${closeTime})` };
  }

  return { valid: true };
}
