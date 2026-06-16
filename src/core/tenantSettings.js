// src/core/tenantSettings.js — Read per-tenant settings from JSON files.
// Shared utility for business hours validation, notifications, and reminders.

import { readFileSync, existsSync } from 'fs';
import { childLogger } from './logger.js';

const log = childLogger('tenant-settings');
const DATA_DIR = './data';

// Whitelist: tenant IDs must be alphanumeric with hyphens/underscores only.
// Rejects path traversal sequences like "../" or encoded variants.
const SAFE_TENANT_ID = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate tenantId to prevent path traversal attacks.
 * @param {string} tenantId
 * @returns {boolean}
 */
export function isValidTenantId(tenantId) {
  return (
    typeof tenantId === 'string' &&
    tenantId.length > 0 &&
    tenantId.length <= 128 &&
    SAFE_TENANT_ID.test(tenantId)
  );
}

/**
 * Read settings for a given tenant.
 * Returns an empty object if the file does not exist or is unreadable.
 * @param {string} tenantId
 * @returns {object}
 */
export function readTenantSettings(tenantId) {
  if (!isValidTenantId(tenantId)) {
    log.warn({ tenantId }, 'Invalid tenantId — possible path traversal attempt');
    return {};
  }
  try {
    const file = `${DATA_DIR}/settings-${tenantId}.json`;
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    log.warn({ err: err.message, tenantId }, 'Failed to read tenant settings');
    return {};
  }
}
