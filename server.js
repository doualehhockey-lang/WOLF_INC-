import './env.js';

// server.js — Wolf Engine entry point.
// Import order is intentional: tracing must initialize before any other module.
//
// Start:        node server.js
// Dev watch:    node --watch server.js
// Tests import: { createApp } from './src/api/server.js'  (no port binding)

import { initTracing, shutdownTracing } from './src/core/tracing.js';
await initTracing(); // no-op unless OTEL_ENABLED=true

import { fileURLToPath } from 'url';
import { createApp } from './src/api/server.js';
import { config } from './src/core/config.js';
import { logger } from './src/core/logger.js';
import { destroyDb } from './src/infra/db/dbClient.js';
import { redis } from './src/infra/redis/redisClient.js';
import { prewarmGreeting } from './src/features/voice/greeting.js';
import { saveAudio } from './src/services/audio.utils.js';
import { getAllFlags, subscribeToFlagInvalidations } from './src/core/featureFlags.js';
import { flushUsageEvents } from './src/features/usage/usage.service.js';
import { startReminderScheduler } from './src/features/reminders/reminder.scheduler.js';

const app = createApp();
const PORT = config.PORT;

// ── Process-level error guards ────────────────────────────────────────────────

process.on('uncaughtException', err => {
  logger.fatal(
    { err: err.message, stack: err.stack, type: 'uncaughtException' },
    'Uncaught synchronous exception — process will exit'
  );
  setTimeout(() => process.exit(1), 500).unref();
});

process.on('unhandledRejection', reason => {
  logger.fatal(
    {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      type: 'unhandledRejection',
    },
    'Unhandled promise rejection — process will exit'
  );
  setTimeout(() => process.exit(1), 500).unref();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

const GRACEFUL_TIMEOUT_MS = 15_000;
let _server = null;
let _flagSubscriber = null;

async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received — draining connections');

  // Force-kill if shutdown hangs beyond timeout
  const killer = setTimeout(() => {
    logger.warn({ timeoutMs: GRACEFUL_TIMEOUT_MS }, 'Shutdown timeout exceeded — forcing exit 1');
    process.exit(1);
  }, GRACEFUL_TIMEOUT_MS);
  killer.unref();

  // Stop accepting new connections; wait for in-flight requests to finish
  if (_server) {
    await new Promise(resolve => _server.close(resolve));
  }

  await flushUsageEvents().catch(err =>
    logger.warn({ err: err.message }, 'Usage event flush failed')
  );
  await shutdownTracing().catch(err => logger.warn({ err: err.message }, 'OTel flush failed'));
  await destroyDb().catch(err => logger.warn({ err: err.message }, 'DB pool drain failed'));
  if (_flagSubscriber) await _flagSubscriber.quit().catch(() => {});
  if (redis) await redis.quit().catch(() => {});

  logger.info('Wolf Engine stopped — exiting 0');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start (only when run directly, not when imported by tests) ────────────────

const _isMain = process.argv[1] !== null && fileURLToPath(import.meta.url) === process.argv[1];

if (_isMain) {
  _server = app.listen(PORT, async () => {
    logger.info(
      {
        port: PORT,
        env: config.NODE_ENV,
        redis: !!process.env.REDIS_URL,
        db: !!process.env.DB_HOST,
      },
      'Wolf Engine started'
    );
    await prewarmGreeting(saveAudio);

    // M3 FIX: Warm the feature flag cache from Redis at startup.
    // snapshotFlags() is synchronous — it cannot read Redis. If the cache is cold,
    // it returns all defaults regardless of Redis state. Audit log entries written
    // during the first 30s of a pod's life would record incorrect flag states.
    // Calling getAllFlags() here populates the in-process cache before any
    // request is served, so snapshotFlags() is accurate from the first request.
    try {
      await getAllFlags();
      logger.info('Feature flag cache warmed');
    } catch (err) {
      logger.warn(
        { err: err.message },
        'Failed to warm feature flag cache — defaults will be used'
      );
    }

    // M1 FIX: Subscribe to cross-instance flag invalidations via Redis pub/sub.
    // When any instance calls setFlag(), all instances drop their local cache entry
    // immediately instead of waiting up to 30s for the local TTL to expire.
    _flagSubscriber = await subscribeToFlagInvalidations();

    // Start the SMS reminder scheduler (checks every 60s for upcoming events).
    // Guards inside ensure it is a no-op in test mode or without Twilio credentials.
    startReminderScheduler();
  });
}

export { app };
