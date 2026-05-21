// src/api/middleware/requestId.js — Attach a unique request ID to every request.
// Used for log correlation across services. Reads X-Request-ID if present.

import { randomUUID } from 'crypto';

export function requestId(req, _res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  next();
}
