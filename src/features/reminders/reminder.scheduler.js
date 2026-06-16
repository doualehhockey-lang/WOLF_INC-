// src/features/reminders/reminder.scheduler.js — Appointment reminder scheduler.
// Periodically checks for upcoming appointments and sends reminders.

import { childLogger } from '../../core/logger.js';

const log = childLogger('reminders');

let _intervalId = null;

/**
 * Start the reminder scheduler.
 * Checks every 15 minutes for appointments in the next 24 hours.
 */
export function startReminderScheduler() {
  if (_intervalId) return;
  log.info('Reminder scheduler started');
  _intervalId = setInterval(
    () => {
      // Placeholder — will check DB for upcoming appointments
      log.debug('Reminder check cycle');
    },
    15 * 60 * 1000
  );
  _intervalId.unref(); // Don't prevent process exit
}

/**
 * Stop the reminder scheduler (for graceful shutdown).
 */
export function stopReminderScheduler() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    log.info('Reminder scheduler stopped');
  }
}
