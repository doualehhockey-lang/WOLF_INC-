// src/api/swagger.js — Swagger/OpenAPI documentation mount.

import { childLogger } from '../core/logger.js';

const log = childLogger('swagger');

/**
 * Mount Swagger UI on the Express app.
 * @param {import('express').Express} app
 */
export function mountSwagger(_app) {
  // Swagger UI will be enabled when swagger-ui-express is installed.
  log.debug('Swagger UI mount skipped (not configured)');
}
