// src/features/notifications/notification.service.js — Staff notification service.
// Sends notifications to staff when appointments are created, cancelled, etc.

import { childLogger } from '../../core/logger.js';

const log = childLogger('notifications');

/**
 * Notify staff about an appointment event.
 * @param {string} tenantId
 * @param {object} appointment — { client_name, date, time, service }
 * @param {string} eventType — 'created' | 'cancelled' | 'updated'
 */
export async function notifyStaff(tenantId, appointment, eventType = 'created') {
  // For now, log the notification. In production, this would send email/SMS/push.
  log.info(
    { tenantId, eventType, client: appointment.client_name, date: appointment.date },
    `Staff notification: appointment ${eventType}`
  );
}
