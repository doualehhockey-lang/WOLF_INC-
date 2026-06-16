// src/api/middleware/cors.js — CORS with explicit origin whitelist.
// Origins are loaded from config.CORS_ORIGINS (comma-separated list).
// Audio files served at /audio are always cross-origin (Twilio fetches them).

<<<<<<< HEAD
import corsLib from 'cors';
=======
import corsLib        from 'cors';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import { corsOrigins } from '../../core/config.js';

// ── API routes — whitelist only ───────────────────────────────────────────────
export const cors = corsLib({
  origin: (origin, cb) => {
    // Allow server-to-server calls (no Origin header) and whitelisted origins.
    if (!origin || corsOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
<<<<<<< HEAD
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
=======
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
});

// ── /audio — fully open (Twilio CDN needs to reach this) ─────────────────────
export const audioCors = corsLib({ origin: '*', methods: ['GET'] });
